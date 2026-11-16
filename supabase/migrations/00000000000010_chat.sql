-- M20: in-app chat/messaging — `conversations` + `messages` tables, RLS,
-- the conversations_enforce_columns / touch_conversation_on_message
-- triggers, and the my_conversation_unread_counts() helper (spec
-- docs/design/chat-spec.md). First use of Supabase Realtime in this
-- codebase (see §2.5 — `alter publication supabase_realtime add table
-- public.messages;` must additionally be run against production, separate
-- from this migration file, per the spec's own production checklist).

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  renter_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Denormalized for cheap inbox ordering/snippet without a correlated
  -- subquery per row (same "denormalize for a read the UI needs every page
  -- load" reasoning as bookings' considered-and-rejected owner_id
  -- denormalization — except here it's accepted, because unlike that case
  -- this is maintained by a single trigger with no risk of drifting from a
  -- second source of truth).
  last_message_at timestamptz not null default now(),
  last_message_preview text,
  -- Per-participant read cursors (decision: NOT a row-per-message read_at —
  -- two columns is simpler, avoids an UPDATE per message read, and is all
  -- a 2-party conversation needs).
  owner_last_read_at timestamptz,
  renter_last_read_at timestamptz,
  constraint conversations_distinct_parties check (owner_id <> renter_id),
  constraint conversations_unique_key unique (listing_id, owner_id, renter_id)
);

create index conversations_owner_id_idx on public.conversations (owner_id, last_message_at desc);
create index conversations_renter_id_idx on public.conversations (renter_id, last_message_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint messages_body_not_blank check (char_length(trim(body)) > 0),
  constraint messages_body_max_len check (char_length(body) <= 2000)
);

create index messages_conversation_id_created_at_idx on public.messages (conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- ---------------------------------------------------------------------------
-- RLS — conversations (spec §2.1)
-- ---------------------------------------------------------------------------

create policy "Participants can view their conversations"
  on public.conversations for select
  using (auth.uid() = owner_id or auth.uid() = renter_id);

-- Insert: renter-initiated only (matches the only entry point this pass
-- actually has — "Message owner" on the listing page). owner_id is
-- re-derived from listings, never client-supplied, which also makes
-- self-messaging impossible (an owner viewing their own listing can't
-- produce a row where owner_id <> their own id while renter_id = their own
-- id, since the WITH CHECK requires auth.uid() = renter_id).
create policy "A renter can start a conversation with a listing's owner"
  on public.conversations for insert
  with check (
    auth.uid() = renter_id
    and owner_id = (select l.owner_id from public.listings l where l.id = listing_id)
  );

-- Update: row-ownership boundary only (same two-layer pattern as
-- bookings) — which COLUMNS may change, and by whom, is enforced by the
-- trigger below, not by this policy.
create policy "Participants can update their conversation's read cursor"
  on public.conversations for update
  using (auth.uid() = owner_id or auth.uid() = renter_id)
  with check (auth.uid() = owner_id or auth.uid() = renter_id);

-- No delete policy — same "history stays intact" convention as bookings.

-- ---------------------------------------------------------------------------
-- Column-level invariant enforcement, same philosophy as
-- bookings_enforce_transition: RLS above only gates *row* ownership; this
-- trigger gates *which* columns a given caller may change on an otherwise-
-- permitted row. listing_id/owner_id/renter_id/created_at are immutable.
-- last_message_at/last_message_preview are maintained by the
-- touch_conversation_on_message trigger (fires as the message sender, who
-- is always a participant per messages' own INSERT policy) and are left
-- open to either participant — there is no security stake in who bumps a
-- timestamp/preview on a conversation they're already part of. Each
-- participant may only move their OWN *_last_read_at column forward.
-- ---------------------------------------------------------------------------

create function public.conversations_enforce_columns()
returns trigger
language plpgsql
as $$
begin
  if new.listing_id is distinct from old.listing_id
     or new.owner_id is distinct from old.owner_id
     or new.renter_id is distinct from old.renter_id
     or new.created_at is distinct from old.created_at
  then
    raise exception 'conversations: this column may not be changed';
  end if;

  if new.owner_last_read_at is distinct from old.owner_last_read_at
     and auth.uid() <> old.owner_id
  then
    raise exception 'conversations: only the owner may change owner_last_read_at';
  end if;

  if new.renter_last_read_at is distinct from old.renter_last_read_at
     and auth.uid() <> old.renter_id
  then
    raise exception 'conversations: only the renter may change renter_last_read_at';
  end if;

  return new;
end;
$$;

create trigger conversations_enforce_columns
  before update on public.conversations
  for each row execute procedure public.conversations_enforce_columns();

-- ---------------------------------------------------------------------------
-- RLS — messages (spec §2.2)
-- ---------------------------------------------------------------------------

create policy "Participants can view messages in their conversations"
  on public.messages for select
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.owner_id = auth.uid() or c.renter_id = auth.uid())
    )
  );

-- Sender must be the authenticated caller (never client-supplied, same
-- convention as bookings.renter_id) AND must be a participant of the
-- target conversation. This is the RLS half of the sender-participancy
-- check; sendMessage() re-derives and checks this again server-side as
-- defense-in-depth (spec §4).
create policy "Participants can send messages in their conversations"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.owner_id = auth.uid() or c.renter_id = auth.uid())
    )
  );

-- No update/delete policy — messages are immutable, same "history intact"
-- convention as bookings. Plain-text-only (§7) means there is nothing to
-- edit in this pass anyway.

-- ---------------------------------------------------------------------------
-- Trigger — bump conversations.last_message_at/last_message_preview
-- (spec §2.3). Not SECURITY DEFINER: it runs as the message sender, who is
-- already a participant (the messages INSERT policy already established
-- that), and the UPDATE it performs lands on a row that participant may
-- update per the conversations UPDATE policy above; the column-check
-- trigger above explicitly allows last_message_at/last_message_preview to
-- change for any participant. No privilege elevation needed.
-- ---------------------------------------------------------------------------

create function public.touch_conversation_on_message()
returns trigger
language plpgsql
as $$
begin
  update public.conversations
  set last_message_at = new.created_at,
      last_message_preview = left(new.body, 140)
  where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute procedure public.touch_conversation_on_message();

-- ---------------------------------------------------------------------------
-- Unread-count helper (spec §2.4) — plain SECURITY INVOKER, no elevation
-- needed since RLS already scopes every row touched to "mine". One row per
-- conversation the caller participates in, with that conversation's unread
-- count for the caller. Backs both the inbox page's per-row badge and
-- (summed) the header's total badge — one source of truth.
-- ---------------------------------------------------------------------------

create function public.my_conversation_unread_counts()
returns table (conversation_id uuid, unread_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.id,
    count(m.id) filter (
      where m.sender_id <> auth.uid()
        and m.created_at > coalesce(
          case when c.owner_id = auth.uid() then c.owner_last_read_at else c.renter_last_read_at end,
          'epoch'::timestamptz
        )
    )
  from public.conversations c
  left join public.messages m on m.conversation_id = c.id
  where c.owner_id = auth.uid() or c.renter_id = auth.uid()
  group by c.id;
$$;

grant execute on function public.my_conversation_unread_counts() to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime (spec §2.5) — required for live message delivery in the thread
-- view. Safe/idempotent to include in this migration (and therefore to run
-- locally via `supabase db reset`/`db push` against the local shadow DB),
-- and is ALSO called out as its own explicit step in the spec's production
-- migration checklist (§8) in case it is ever missed when this file is
-- otherwise applied another way. `conversations` is deliberately NOT added
-- — no client in this pass subscribes to it (see spec §2.5).
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.messages;

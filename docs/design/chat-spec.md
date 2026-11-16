# M20 — In-app chat / messaging

Status: ready for implementation
Scope: `apps/web` only (mobile/Expo deferred, see §8). New feature, not a retrofit — new
`conversations` + `messages` tables, new RLS, first use of Supabase Realtime in this
codebase, three new UI surfaces.

## 0. Why this exists / what it is NOT

Today there is **zero way for a prospective renter to contact a listing owner before
submitting a booking request.** `booking_contact()` (`00000000000004_bookings.sql`) only
reveals the owner's phone number to a renter **after** the owner approves a booking —
that mechanism, and `ContactInfo.tsx`'s rendering of it, are completely unchanged by this
spec. Chat is a second, earlier, and independent channel: available any time (before a
booking request even exists, during it, and after), always in addition to — never a
replacement for — the post-approval phone reveal.

This spec does not touch `apps/web/src/app/bookings/actions.ts`,
`apps/web/src/components/bookings/ContactInfo.tsx`, or the renter-header-badge /
contact-callout work landing separately on `feature/bugfix-booking-approval-signal`. That
branch is a different, concurrent piece of work; this milestone reads its own header-badge
convention from `Header.tsx` at implementation time and adds a third nav item alongside
whatever that branch has already added, without touching its badges.

## 1. Conversation key (decision)

A conversation is uniquely identified by **`(listing_id, owner_id, renter_id)`** — not by
any one booking. This is deliberately simple per the task's own steer ("don't
overcomplicate this"):

- One conversation per (listing, the two people), full stop. If the same renter asks about
  the same listing twice, it's the same thread. If the same two people transact on two
  different listings the owner has, that's two separate conversations (a listing is the
  natural grouping a user expects in an inbox — "the drill guy" vs. "the ladder guy" could
  be the same person).
- **No `booking_id` column anywhere in this schema.** If a booking request is later
  submitted for the same listing+renter pair, it is not linked to the conversation in this
  pass — the renter/owner can still see both (the chat thread, and the booking status
  page) side by side, just not cross-referenced. Documented here as an explicit,
  deliberate deferral (fast-follow candidate: surface booking status inline in the thread
  header), same deferral convention as M6/M8/M17/M18.
- `owner_id` is always **re-derived from `listings.owner_id` server-side**, never trusted
  from client input — same discipline as `listings.owner_id` itself and every other
  owner-derivation in this codebase (`createBookingRequest`, etc).

## 2. Schema — `supabase/migrations/00000000000010_chat.sql`

```sql
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
```

### 2.1 RLS — `conversations`

```sql
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
```

```sql
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
```

### 2.2 RLS — `messages`

```sql
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
```

### 2.3 Trigger — bump `conversations.last_message_at`/`last_message_preview`

```sql
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
```

Not `security definer`: it runs as the message sender, who is already a participant (the
messages INSERT policy already established that), and the UPDATE it performs lands on a row
that participant may update per §2.1's conversations UPDATE policy; the column-check trigger
in §2.1 explicitly allows `last_message_at`/`last_message_preview` to change for any
participant. No privilege elevation needed — least-privilege over the bookings
`SECURITY DEFINER` precedent, used there only because that case genuinely needed to defeat
RLS (cross-user phone lookup, overlap-check visibility). Nothing here needs that.

### 2.4 Unread-count helpers (plain `SECURITY INVOKER` functions — no elevation needed; RLS already scopes every row touched to "mine")

```sql
-- One row per conversation the caller participates in, with that
-- conversation's unread count for the caller. Backs both the inbox page's
-- per-row badge and (summed) the header's total badge — one source of
-- truth, not two separately-maintained counts that could drift.
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
```

`Header.tsx` calls this and sums `unread_count` client^H^H^Hserver-side for the total badge;
`/messages` calls it once and keys the per-row badges off the same result set — a single
round trip serves both the inbox page's own badges and (via a second, identical call) the
header's total, with no second query shape to keep in sync.

### 2.5 Realtime — what must be run against production

```sql
alter publication supabase_realtime add table public.messages;
```

**This is the one statement Max must not forget** (flagged per the task's own warning) —
without it, `postgres_changes` subscriptions on `messages` silently receive nothing, with
no error. `conversations` is deliberately **not** added to the realtime publication — no
client in this pass subscribes to it (the thread view only needs live `messages` inserts;
the inbox/header badges are computed per-request on normal page load/navigation, same
"recomputed server-side per request" convention `pendingRequestCount` already uses in
`Header.tsx` — no live-updating badge in this pass, scoped out to keep this bounded).

**RLS + Realtime interaction (read this before assuming it "just works"):** Supabase
Realtime's `postgres_changes` evaluates the subscribing connection's row visibility using
the same RLS policies as a normal query, under the authenticated user's own JWT — which
means the messages SELECT policy in §2.2 is the *entire* authorization boundary for who
receives a given live row. This is exactly why QA must **empirically** verify both
directions (see §6) rather than trust this from documentation alone: (a) two real sessions,
both genuine participants, confirm a message sent by one appears live for the other with no
page refresh; (b) a third real session that is **not** a participant in that conversation
confirms it receives nothing when subscribed to the same `conversation_id` filter, and that
directly querying/selecting that conversation's messages as that third user returns zero
rows. The client must subscribe using the same browser-side Supabase client the user is
already authenticated with (not a fresh anonymous client) — `supabase-js` sets the realtime
connection's auth token from the existing session automatically, but this is new territory
for this codebase and is exactly the kind of "assumed correct, not verified" gap the task
calls out.

## 3. Entry points / UI

### 3.1 Listing detail page — "Message [owner name]"

In `apps/web/src/app/listings/[id]/page.tsx`, in the existing "Owner" block (the one
rendering `OwnerAvatar`/`owner.full_name`), add a button — **hidden when `isOwner`** (an
owner never gets a "message yourself" button, same convention as the existing
`isOwner`-gated edit link and the booking form's owner branch).

```
Message {owner?.full_name || "the owner"}
```

On click, calls a new Server Action `startConversation(listingId)` in a new
`apps/web/src/app/messages/actions.ts`:

1. `auth.getUser()` — if not logged in, redirect to `/login?redirectTo=/listings/{id}`
   (same pattern `RequestToRentForm` already uses for its own logged-out case).
2. Look up the listing's real `owner_id` server-side (never trust any client-passed value).
3. Reject (friendly message, same as `createBookingRequest`'s `ownListing` check) if
   `owner_id === user.id` — belt-and-suspenders backstop; the button is already hidden for
   this case.
4. `select`-or-insert the conversation row for `(listing_id, owner_id, renter_id: user.id)` —
   `maybeSingle()` first; if absent, `insert(...).select().single()`. The unique constraint
   in §2 (`conversations_unique_key`) is the real race-safety net if two tabs double-submit;
   on a unique-violation, re-`select` and proceed rather than erroring.
5. `redirect(`/messages/${conversation.id}`)`.

### 3.2 Inbox — `/messages`

New page, `apps/web/src/app/messages/page.tsx`. Lists the caller's conversations (both as
owner and as renter — one unified list, not two tabs; a small "You" vs. the listing title
disambiguates which side the viewer is on), ordered by `last_message_at desc`. Each row:

- Other party's name + avatar (`public_profiles`, same pattern as the owner block on the
  listing page).
- Listing title (small, muted — links to the listing).
- `last_message_preview` (truncated, muted, same visual weight as a typical inbox snippet).
- Relative/short timestamp of `last_message_at`.
- Unread-count pill if `unread_count > 0` for that row, from `my_conversation_unread_counts()`
  (§2.4) — same pill shape as the header's, `bg-primary text-primary-foreground` (an unread
  message is "something to look at," same semantic as the existing owner pending-request
  badge, not the "good news" green used for an approved booking).

Empty state: "No messages yet — message a listing owner from any listing page to start a
conversation," consistent with this app's existing empty-state copy conventions
(`m13-visual-craft-spec.md`).

### 3.3 Thread view — `/messages/[id]`

New page, `apps/web/src/app/messages/[id]/page.tsx`, a Server Component that:

1. Loads the conversation, independently re-verifying the caller is a participant
   (`owner_id = auth.uid() or renter_id = auth.uid()`) before rendering anything — RLS
   already guarantees a non-participant's `select` returns nothing, so this is the same
   "RLS is primary, but the server component double-checks and 404s cleanly" convention
   `ListingDetailPage` already follows for its own listing lookup.
2. Loads the full message history (`order by created_at asc`) — no pagination in this pass,
   same "dataset is small, don't over-build" call M6 made for reviews.
3. Fires a `markConversationRead(conversationId)` Server Action on load (sets the caller's
   own `*_last_read_at` to `now()` — see §4 for its independent participancy check).
4. Renders a new Client Component, `MessageThread.tsx`, which:
   - Renders each message as a plain text node (`{message.body}`, never
     `dangerouslySetInnerHTML` — React escapes text-node content by default, which is the
     entire XSS defense needed for plain-text-only chat per §7; code review must confirm no
     raw-HTML rendering path was introduced).
   - Visually distinguishes "my messages" (right-aligned, `bg-primary text-primary-foreground`
     bubble) from "their messages" (left-aligned, `bg-surface border border-line` bubble) —
     on-brand, not a generic gray/blue chat-bubble default.
   - Renders each message's timestamp using the viewer's actual local time (`toLocaleString`
     in the client component — this runs in the browser, so it is already correct per-viewer
     wall-clock time; no server-side Toronto-specific formatting needed here, unlike a
     date-only field like a booking's `start_date` — this is a `timestamptz`, not a bare
     `date`, so there is no UTC-vs-Toronto ambiguity to get wrong as long as it's never
     formatted with a hardcoded/UTC-forced timezone).
   - Subscribes to `postgres_changes` on `messages` filtered to this `conversation_id` on
     mount (and unsubscribes on unmount) — appends an incoming row to local state. The
     initial list (loaded via the Server Component) plus appended realtime rows must not
     double-render the sender's own just-sent message (de-dupe by message `id`, since the
     send action's own response already appends it optimistically or via revalidation —
     implementer's call on optimistic-append vs. wait-for-realtime-echo, but it must not
     double-render either way).
   - A message composer (`textarea` + "Send" button) wired to a new `sendMessage` Server
     Action (§4), 2000-char limit mirrored client-side (not just the DB constraint) for
     immediate feedback, clears on successful send.

## 4. `sendMessage` — defense-in-depth (not just RLS)

```ts
// apps/web/src/app/messages/actions.ts
export async function sendMessage(conversationId: string, formData: FormData) { ... }
```

Must independently re-verify, server-side, before inserting — not trust that RLS will
simply reject a bad request silently:

1. `auth.getUser()` — reject if not logged in.
2. Look up the conversation; reject with a friendly "You don't have access to this
   conversation" if `owner_id !== user.id && renter_id !== user.id` (RLS would also reject
   the subsequent insert, but this gives a clean error message instead of an opaque
   PostgREST failure, same convention as `approveBooking`'s independent ownership
   re-check before relying on RLS alone).
3. Validate `body`: trim, reject blank, reject over 2000 chars (mirrors the DB CHECK —
   this is the friendly-message layer in front of it, same "parseDates then let the DB
   CHECK be the backstop" pattern `createBookingRequest` already uses).
4. Insert with `sender_id: user.id` (never client input).
5. `revalidatePath(`/messages/${conversationId}`)` and `revalidatePath("/messages")`.

`markConversationRead` follows the identical independent-participancy-check shape before its
UPDATE.

## 5. Header badge

In `Header.tsx`, alongside the existing "Bookings" link (and whatever renter-approved-badge
the concurrent `feature/bugfix-booking-approval-signal` branch has added by the time this
merges — **read the file's current state at implementation time and add alongside it,
don't clobber it**), add a new nav link:

```
Messages
```

pointing at `/messages`, with a `bg-primary text-primary-foreground` pill showing the total
unread count (sum of `my_conversation_unread_counts()`, §2.4) when `> 0`, same `99+` cap and
`aria-label` convention as the existing pending-request pill. Primary-orange, not the
success-green used for the approved-booking badge — an unread message is "something to look
at," the same semantic class as a pending request, not "good news, nothing to do."

## 6. QA requirements (beyond the standard pass)

1. **Realtime delivery, two real browser sessions, two different real users who ARE both
   participants in the same conversation**: user A sends a message; user B's already-open
   thread view must show it appear with no manual refresh. Repeat in the other direction.
2. **Realtime + RLS negative test, a third real user who is NOT a participant**: confirm
   that user cannot see the conversation in their own `/messages` inbox, cannot load
   `/messages/{thatConversationId}` directly (must not leak message content — a clean
   "not found"/redirect, not a page that renders empty state while still disclosing the
   conversation exists), and — the part that must be checked empirically, not assumed —
   does not receive any realtime event if made to subscribe to that `conversation_id`
   (e.g. via the browser console) while messages are being sent in it.
3. **XSS**: send a message containing `<script>`/`<img onerror=...>` style payloads;
   confirm it renders as inert literal text, never executes.
4. **Production build**: `npm run build && npm run start` (not `next dev`) — confirm the
   Realtime subscription actually establishes and delivers in a production-style build
   (first use of Realtime in this codebase; this project's standing caution about
   Next-SSR/client-only wiring, previously applied to Leaflet in M17/M18, applies here too).
5. Self-messaging is impossible: the "Message owner" button does not render for the
   listing's own owner, and a hand-built `startConversation` call against one's own listing
   is rejected server-side.
6. Standard functionality-robustness pass per this project's own checklist: no non-async
   export from a `"use server"` file, no partial-apply-before-validation, double-submit
   guarded on the composer (disable button while a send is in flight).

## 7. Explicitly out of scope / deferred (same deferral convention as M6/M8/M17/M18)

- **Abuse/spam/rate-limiting** — not built. Real usage today is ~4 test users; revisit if
  real abuse is ever observed.
- **Attachments/images in chat** — plain text only this pass.
- **Mobile (Expo) app** — web-only; `apps/mobile` untouched. Fast-follow candidate.
- **Email-on-new-message notification** — in-app badge only, same reasoning as the existing
  deferred booking-request-email-notification item (`docs/design/booking-request-email-notification.md`).
- **Booking linkage** — no `booking_id` on conversations/messages (§1); a fast-follow could
  surface booking status inline in the thread.
- **Live-updating inbox/header badges** — computed per-request on normal navigation, not
  itself realtime-subscribed (only the open thread view's message list is live).
- **Message editing/deletion** — immutable, matches this project's existing
  history-stays-intact convention (bookings, reviews).

## 8. Migration checklist for Max (production `supabase db push`)

1. `supabase/migrations/00000000000010_chat.sql` — creates `conversations` + `messages`,
   their RLS policies, the `conversations_enforce_columns` / `touch_conversation_on_message`
   triggers, and the `my_conversation_unread_counts()` function.
2. **`alter publication supabase_realtime add table public.messages;`** — required for live
   delivery; easy to forget, called out explicitly per the task's own warning. Without this,
   subscriptions silently receive nothing (no error surfaced anywhere).

No Storage bucket, no new extension, no other provider/account — Realtime is already part
of the existing free-tier Supabase project.

-- M5: booking request/approval flow — `bookings` table, RLS, and the
-- booking-scoped phone-visibility mechanism (spec docs/design/m5-booking-spec.md).
-- Extends 00000000000001_init_profiles.sql / 00000000000002_listings.sql
-- (set_updated_at() trigger, EXISTS-join-to-parent RLS style) rather than
-- replacing them.

-- ---------------------------------------------------------------------------
-- Backend decision: `status` as constrained `text`, not a Postgres enum.
--
-- Spec §2 leaves this to the backend engineer, noting the same either/or
-- called out for `listings.category` in M3 §1 — but `listings.category` and
-- `listings.status` actually took *different* answers in that migration
-- (category is a `public.listing_category` enum; `listings.status` is plain
-- `text ... check (status in (...))`). `bookings.status` is the same shape
-- of thing as `listings.status` (a small lifecycle flag, not a fixed
-- catalog of business categories), so it follows that precedent: a `text`
-- CHECK constraint. This avoids `ALTER TYPE ... ADD VALUE` migration
-- friction if a future milestone adds a status (e.g. a `completed` state),
-- and keeps the four-value set trivially visible in this file.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Backend decision: no `owner_id` denormalization on `bookings`.
--
-- Spec §2 flags this as optional/backend's call. Kept out for M5: it's not
-- needed by the UI (every owner-side query already joins to `listings`
-- anyway, per spec §6), and omitting it keeps `listings.owner_id` the single
-- source of truth — no risk of the two ever disagreeing if a listing were
-- ever transferred between owners (not a real feature today, but the
-- `listing_images` table already sets this precedent: it has no denormalized
-- owner_id either, and its RLS uses the same EXISTS-join-to-listings style
-- used below). If the EXISTS-join RLS policies below ever show up as a real
-- performance problem at scale, adding `owner_id` later is a small additive
-- migration + backfill, not a breaking change.
-- ---------------------------------------------------------------------------

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  renter_id uuid not null references auth.users (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Inclusive same-day bookings are valid (spec §3.2): start_date = end_date
  -- is a real 1-day rental, so this only rejects end < start.
  constraint bookings_date_range_check check (end_date >= start_date)
  -- Deliberately NOT adding a `start_date >= current_date` ("no past
  -- bookings") CHECK here: a CHECK constraint re-evaluates on every UPDATE,
  -- not just INSERT, and would start rejecting perfectly valid status
  -- transitions (e.g. cancelling an `approved` booking, or an owner
  -- declining a `pending` one) once real-world time simply advances past an
  -- existing booking's start_date. "No past-date bookings" is therefore
  -- enforced at request-creation time only, in the createBookingRequest
  -- server action (spec §3.4) — an INSERT-time business rule, not a
  -- standing data-integrity invariant suitable for a table CHECK.
);

-- Suggested indexes from spec §2.
create index bookings_renter_id_idx on public.bookings (renter_id);
create index bookings_listing_id_status_idx on public.bookings (listing_id, status);

alter table public.bookings enable row level security;

-- Renter can see their own booking requests (any status).
create policy "Renters can view their own bookings"
  on public.bookings for select
  using (auth.uid() = renter_id);

-- Renter can create a request for themselves. `renter_id` is always taken
-- from the authenticated session server-side (never client input) — this
-- WITH CHECK is the real enforcement of that, same convention as
-- `listings.owner_id`.
create policy "Renters can insert their own bookings"
  on public.bookings for insert
  with check (auth.uid() = renter_id);

-- Renter can update their own booking's status. This RLS policy alone does
-- not restrict *which* status transitions are legal (Postgres RLS has no
-- access to the OLD row's column values in a plain USING/WITH CHECK clause
-- without a trigger) — the actual transition rules (spec §1: renter may
-- move pending/approved -> cancelled only) are enforced in the
-- cancelBooking server action before the UPDATE runs, per spec §2's
-- explicitly-allowed "server action with explicit ownership/state check"
-- convention. RLS here is the row-ownership boundary; the action is the
-- state-machine boundary.
create policy "Renters can update their own bookings"
  on public.bookings for update
  using (auth.uid() = renter_id)
  with check (auth.uid() = renter_id);

-- Listing owner can see bookings made against their own listings (mirrors
-- the listing_images owner-access policy style in 00000000000002_listings.sql).
create policy "Listing owners can view bookings on their listings"
  on public.bookings for select
  using (
    exists (
      select 1 from public.listings l
      where l.id = bookings.listing_id and l.owner_id = auth.uid()
    )
  );

-- Listing owner can update status on bookings against their own listings
-- (approve/decline a pending request, or cancel an approved one). Same note
-- as the renter update policy above: transition legality is enforced in the
-- approveBooking/declineBooking/cancelBooking server actions, not here.
create policy "Listing owners can update bookings on their listings"
  on public.bookings for update
  using (
    exists (
      select 1 from public.listings l
      where l.id = bookings.listing_id and l.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.listings l
      where l.id = bookings.listing_id and l.owner_id = auth.uid()
    )
  );

-- No delete policy for either party (spec §2): cancelling is a status
-- change, not a row deletion, so history stays intact for §5/§6's "History"
-- sections.

create trigger set_bookings_updated_at
  before update on public.bookings
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Phone visibility on approved bookings (spec §3.5) — backend decision:
-- a SECURITY DEFINER function, not an additional RLS policy on `profiles`.
--
-- Rejected alternative: adding a policy to `public.profiles` scoped to the
-- EXISTS condition spec §3.5 sketches. That would work, but it widens what
-- *any* ordinary `select ... from profiles` query returns for any caller
-- that happens to match the EXISTS condition — every present and future
-- code path that queries `profiles` (not just the booking-contact UI) would
-- silently start being able to read `phone` for matching rows, which is a
-- much broader surface than "the booking pages show contact info on an
-- approved booking." A SECURITY DEFINER function scopes the phone exposure
-- to exactly one narrow, auditable call site (`booking_contact(booking_id)`)
-- with its own WHERE clause re-deriving the same "counterparty of an
-- approved booking I'm party to" condition — nothing else about `profiles`
-- RLS changes, and `public_profiles` (spec's explicit "stays unchanged")
-- is untouched.
create function public.booking_contact(booking_id uuid)
returns table (full_name text, phone text)
language sql
security definer
set search_path = public
stable
as $$
  select p.full_name, p.phone
  from public.bookings b
  join public.listings l on l.id = b.listing_id
  join public.profiles p
    on p.id = case
      when b.renter_id = auth.uid() then l.owner_id
      when l.owner_id = auth.uid() then b.renter_id
    end
  where b.id = booking_contact.booking_id
    and b.status = 'approved'
    and (b.renter_id = auth.uid() or l.owner_id = auth.uid());
$$;

grant execute on function public.booking_contact(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Availability-overlap check (spec §4) — SECURITY DEFINER helper function.
--
-- Not a design deviation from spec §4's "application-level checks, not a DB
-- exclusion constraint" decision: this function does not run automatically
-- on INSERT/UPDATE (no trigger), it is explicitly called BY the app at both
-- checkpoints (createBookingRequest and approveBooking), which remain free
-- to decide what to do with the result (reject with the spec's friendly
-- copy) — exactly the "application-level checks at two checkpoints" model
-- spec §4 describes, just with the actual row-scan running server-side in a
-- single round trip instead of the app pulling rows back to filter in JS.
--
-- Why SECURITY DEFINER rather than a plain client-side `select`: the RLS
-- policies above intentionally only let a caller see bookings where they
-- are the renter or the listing's owner. A prospective renter performing
-- checkpoint-1 (are these dates free on someone else's listing?) is neither
-- — under plain RLS they would see zero existing rows and the overlap check
-- would always pass, silently defeating checkpoint 1 entirely. This
-- function runs as its owner (bypassing RLS) but returns only a boolean —
-- no booking id, renter identity, or date range of the conflicting row is
-- exposed, which is the minimum information disclosure needed to answer
-- "would this new range collide with an approved booking."
create function public.booking_has_approved_overlap(
  p_listing_id uuid,
  p_start_date date,
  p_end_date date,
  p_exclude_booking_id uuid default null
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.bookings b
    where b.listing_id = p_listing_id
      and b.status = 'approved'
      and b.start_date <= p_end_date
      and b.end_date >= p_start_date
      and (p_exclude_booking_id is null or b.id <> p_exclude_booking_id)
  );
$$;

grant execute on function public.booking_has_approved_overlap(uuid, date, date, uuid) to authenticated;

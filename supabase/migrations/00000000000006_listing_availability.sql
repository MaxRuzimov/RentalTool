-- M15: availability blocking on the request-to-rent UI (spec
-- docs/design/m15-availability-spec.md §2). Purely additive/read-only on top
-- of the existing double-booking checkpoints in 00000000000004_bookings.sql
-- (booking_has_approved_overlap, createBookingRequest, approveBooking) —
-- none of that write-path logic is touched by this migration.

-- ---------------------------------------------------------------------------
-- `listing_approved_booking_ranges` (spec §2.2) — SECURITY DEFINER helper,
-- exposing a listing's approved-booking date ranges to *any* viewer of that
-- listing's public page, including logged-out visitors.
--
-- Why a new function, not a plain client-side `select` (spec §2.1): the
-- `bookings` RLS policies (00000000000004_bookings.sql) only let a caller
-- see rows where they're the renter or the listing's owner. A prospective
-- renter browsing someone else's listing is neither of those — a plain
-- `select ... from bookings` from the listing detail page would return zero
-- rows for every third-party viewer, silently defeating the whole point of
-- this milestone (showing "these dates are taken" *before* submit). This is
-- the identical shape of problem `booking_has_approved_overlap` already
-- solved for the server-side checkpoint-1/2 checks (see that function's own
-- comment block below) — same fix, now needed for a public, pre-submission
-- read instead of a request-time check.
--
-- `SECURITY DEFINER`, granted to both `anon` and `authenticated` — unlike
-- `booking_has_approved_overlap`/`booking_contact` (authenticated-only,
-- since those are only ever called from an already-authenticated server
-- action), this one must also work for a logged-out visitor (spec §0/§1,
-- M5 §3.1.B), so it's granted to `anon` too.
--
-- The `l.status = 'published' or l.owner_id = auth.uid()` guard is the one
-- thing genuinely new versus `booking_has_approved_overlap`/`booking_contact`
-- above. Without it, this function could be used to enumerate booking
-- activity on someone's unpublished/draft listing by guessing listing ids.
-- `booking_has_approved_overlap` doesn't need an equivalent check because
-- it's only ever called by the app against a listing id it already resolved
-- from a real page load or an existing booking row — never a raw,
-- client-supplied id with no other gate. This function is different: it's
-- reachable from a public page for *any* listing id a caller cares to pass,
-- so it must independently re-derive the same visibility rule as the
-- "Anyone can view published listings" RLS policy on `listings`
-- (00000000000002_listings.sql) rather than relying on RLS to have already
-- filtered anything — SECURITY DEFINER bypasses RLS by design, so this guard
-- is the only thing standing in for it here.
--
-- Returns only `start_date`/`end_date` — no booking id, no renter identity,
-- no listing title. Same minimum-disclosure principle as
-- `booking_has_approved_overlap`'s boolean-only return: a third-party viewer
-- learns "these date ranges are taken," nothing about who booked them or
-- which specific booking row it is.
--
-- `status = 'approved'` only, same as `booking_has_approved_overlap` —
-- `pending`/`declined`/`cancelled` bookings never block anything (spec §0,
-- unchanged from M5 §4), and surfacing any of those as "unavailable" would
-- actively mislead a renter into thinking dates are taken when they might
-- still be requestable.
--
-- No date filtering (e.g. "only future ranges") — deliberately mirrors
-- `booking_has_approved_overlap`, which also doesn't filter by "today": a
-- past-dated approved range simply never overlaps a new request whose
-- start_date >= today (that "no past-date bookings" rule is already
-- enforced at request-creation time, M5 §3.4, not here). Keeping this
-- function date-agnostic means it has one less thing to get subtly out of
-- sync with "today" across client/server.
create function public.listing_approved_booking_ranges(p_listing_id uuid)
returns table (start_date date, end_date date)
language sql
security definer
set search_path = public
stable
as $$
  select b.start_date, b.end_date
  from public.bookings b
  join public.listings l on l.id = b.listing_id
  where b.listing_id = p_listing_id
    and b.status = 'approved'
    and (l.status = 'published' or l.owner_id = auth.uid())
  order by b.start_date;
$$;

grant execute on function public.listing_approved_booking_ranges(uuid) to anon, authenticated;

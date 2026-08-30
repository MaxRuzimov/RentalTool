-- M6: rating/review system — `reviews` table + RLS (spec
-- docs/design/m6-reviews-spec.md). Extends 00000000000002_listings.sql /
-- 00000000000004_bookings.sql (EXISTS-join-to-parent RLS style) rather than
-- replacing them. Deliberately does NOT touch `public.bookings` or its
-- `bookings_enforce_transition` trigger — eligibility (spec §2) is a
-- read-only predicate over the existing `status`/`end_date` columns, not a
-- new booking state.

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  -- Unique: exactly one review per booking (spec §2 "one review per
  -- booking, not one per renter-listing pair"), not per (renter_id,
  -- listing_id) — a renter who rents the same tool twice may leave a
  -- separate review each time. This constraint also doubles as an index.
  booking_id uuid not null references public.bookings (id) on delete cascade unique,
  -- Denormalized from bookings.listing_id, set server-side at insert time
  -- from the booking row, never from client input — see spec §4's
  -- justification (the public /listings/[id] review-read path must not join
  -- `bookings`, whose RLS is scoped to renter/owner only, not public).
  listing_id uuid not null references public.listings (id) on delete cascade,
  renter_id uuid not null references auth.users (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 500),
  created_at timestamptz not null default now()
  -- No `updated_at` column and no update/delete RLS policy at all below —
  -- reviews are immutable once posted (spec §4's editability decision).
);

-- Public review-read path (spec §6.2): `select ... from reviews where
-- listing_id = $1 order by created_at desc`. Composite index serves that
-- query directly without a separate sort step.
create index reviews_listing_id_created_at_idx on public.reviews (listing_id, created_at desc);

-- Serves "a reviewer can always read their own reviews" (RLS below) and any
-- future "my reviews" listing on /bookings/mine.
create index reviews_renter_id_idx on public.reviews (renter_id);

alter table public.reviews enable row level security;

-- Select: anyone (anon + authenticated) can read reviews belonging to a
-- currently-published listing — same trust level as listing text/photos
-- (spec §5, mirrors listing_images' "Anyone can view images of published
-- listings" policy shape in 00000000000002_listings.sql).
create policy "Anyone can view reviews of published listings"
  on public.reviews for select
  using (
    exists (
      select 1 from public.listings l
      where l.id = reviews.listing_id and l.status = 'published'
    )
  );

-- Select: a reviewer can always read their own review regardless of the
-- listing's current status (spec §5's defensive edge case — e.g. an owner
-- unpublishes a listing after being reviewed).
create policy "Reviewers can view their own reviews"
  on public.reviews for select
  using (auth.uid() = renter_id);

-- Insert: only the reviewing renter, only for their own eligible booking.
-- `renter_id`/`listing_id` are set server-side by createReview (spec §7.2)
-- from the booking row — this WITH CHECK is the DB-level backstop, same
-- "RLS is the real boundary" convention as every prior milestone. The exact
-- eligibility predicate (spec §2) is reproduced here identically to the
-- server-action re-check and the UI-query filter, so all three can never
-- disagree: status = 'approved' and end_date < current_date and (the
-- `unique` constraint on booking_id is the actual enforcement of "no
-- existing review for this booking," not re-checked in this WITH CHECK).
create policy "Renters can insert reviews for their eligible bookings"
  on public.reviews for insert
  with check (
    auth.uid() = renter_id
    and exists (
      select 1 from public.bookings b
      where b.id = reviews.booking_id
        and b.listing_id = reviews.listing_id
        and b.renter_id = auth.uid()
        and b.status = 'approved'
        and b.end_date < current_date
    )
  );

-- No update/delete policy of any kind, for either the reviewing renter or
-- anyone else (spec §4's editability decision) — reviews are permanent once
-- posted.

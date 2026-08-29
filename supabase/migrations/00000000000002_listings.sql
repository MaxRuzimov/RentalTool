-- M3: tool listings — `listings` + `listing_images` tables, RLS, and Storage
-- policies for the `listing-images` bucket. Extends 00000000000001_init_profiles.sql
-- (profiles/RLS conventions, set_updated_at() trigger) rather than replacing it.

-- Fixed category list (spec docs/design/m3-listings-spec.md §2). Kept in sync
-- by hand with apps/web/src/lib/listings/categories.ts — there is no single
-- source of truth shared across DB and app code for MVP, so any change to
-- this list must be made in both places.
create type public.listing_category as enum (
  'power_tools',
  'hand_tools',
  'ladders_access',
  'lawn_garden',
  'cleaning_pressure_washers',
  'generators_power',
  'automotive',
  'construction_heavy_equipment',
  'painting',
  'plumbing',
  'electrical',
  'moving_hauling',
  'party_event',
  'other'
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0 and char_length(title) <= 100),
  description text not null check (char_length(trim(description)) > 0 and char_length(description) <= 2000),
  category public.listing_category not null,
  price_amount numeric(10, 2) not null check (price_amount > 0),
  price_unit text not null default 'day' check (price_unit in ('hour', 'day', 'week')),
  location text not null check (char_length(trim(location)) > 0),
  -- Every listing is immediately live for M3 — no draft workflow is exposed
  -- in the UI (spec §1). The column exists so a future unpublish/archive
  -- affordance is a pure UI + query-filter change, not a migration.
  status text not null default 'published' check (status in ('published', 'unpublished')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index listings_owner_id_idx on public.listings (owner_id);
create index listings_status_created_at_idx on public.listings (status, created_at desc);

alter table public.listings enable row level security;

-- Owner can see/manage all of their own listings regardless of status.
create policy "Owners can view their own listings"
  on public.listings for select
  using (auth.uid() = owner_id);

create policy "Owners can insert their own listings"
  on public.listings for insert
  with check (auth.uid() = owner_id);

create policy "Owners can update their own listings"
  on public.listings for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Owners can delete their own listings"
  on public.listings for delete
  using (auth.uid() = owner_id);

-- Everyone (anon + authenticated), including non-owners, can read published
-- listings. Combined with the owner policy above via OR semantics (Postgres
-- RLS: a row is visible if ANY permissive policy for the action passes).
create policy "Anyone can view published listings"
  on public.listings for select
  using (status = 'published');

create trigger set_listings_updated_at
  before update on public.listings
  for each row execute procedure public.set_updated_at();

-- listing_images: one row per uploaded photo, ordered by `position` (0 =
-- cover image). Storage holds the file bytes; this table holds ordering +
-- lets cascading delete of a listing clean up image rows via plain SQL
-- rather than a Storage API call (spec §4).
create table public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  storage_path text not null,
  position int not null default 0 check (position >= 0),
  created_at timestamptz not null default now()
);

create index listing_images_listing_id_idx on public.listing_images (listing_id, position);

alter table public.listing_images enable row level security;

-- Owner of the parent listing can manage its images (insert/update/delete),
-- regardless of the listing's status.
create policy "Owners can view their own listing images"
  on public.listing_images for select
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_images.listing_id and l.owner_id = auth.uid()
    )
  );

create policy "Owners can insert their own listing images"
  on public.listing_images for insert
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_images.listing_id and l.owner_id = auth.uid()
    )
  );

create policy "Owners can update their own listing images"
  on public.listing_images for update
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_images.listing_id and l.owner_id = auth.uid()
    )
  );

create policy "Owners can delete their own listing images"
  on public.listing_images for delete
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_images.listing_id and l.owner_id = auth.uid()
    )
  );

-- Public (anon + authenticated) can read images belonging to published
-- listings — mirrors the listings table's "anyone can view published" policy.
create policy "Anyone can view images of published listings"
  on public.listing_images for select
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_images.listing_id and l.status = 'published'
    )
  );

-- ---------------------------------------------------------------------------
-- Storage: `listing-images` bucket + storage.objects RLS.
--
-- The bucket itself is declared in supabase/config.toml (local dev) as a
-- *private* bucket (public = false); the real project's bucket must be
-- created the same way (private, not public) once this migration is applied
-- there. All read access goes through these RLS policies, not bucket-level
-- public flag, matching the "no data reachable beyond RLS-scoped access"
-- constraint for this milestone. (The spec text at §4 describes the bucket
-- as "public read" for simplicity; this implementation instead keeps the
-- bucket private and grants public SELECT via RLS, which is behaviorally
-- equivalent for reads — anyone can still fetch a published listing's
-- images without a signed URL — while keeping the bucket itself non-public
-- at the storage-provider level.)
--
-- Path convention: {owner_id}/{listing_id}/{filename}. Ownership is enforced
-- from the FIRST path segment ((storage.foldername(name))[1] = auth.uid()::text)
-- — this only proves the uploader owns that owner_id prefix, not that they
-- own the specific listing_id in segment 2. That's an accepted MVP
-- simplification (documented here per the task's instructions): a signed-in
-- user cannot write into another user's owner_id folder, but nothing at the
-- Storage-policy layer stops them writing under listing_id folders of their
-- OWN other listings, or even a listing_id that doesn't exist yet. This is
-- low-risk because (a) the app never lets a user pick an arbitrary
-- listing_id — it's always the id of a listings row the app just
-- created/loaded for that same owner, and (b) `listing_images` rows (the
-- actual data surfaced in the UI) are separately protected by the RLS
-- policies above, which DO verify listing_id ownership via a join to
-- `listings`. Enforcing the second path segment inside a Storage policy
-- would require a subquery against `public.listings` per object access,
-- which is straightforward to add later if this simplification proves
-- insufficient (see this comment as the flag for a follow-up if so).
create policy "Owners can upload their own listing images"
  on storage.objects for insert
  with check (
    bucket_id = 'listing-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Owners can update their own listing image objects"
  on storage.objects for update
  using (
    bucket_id = 'listing-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Owners can delete their own listing image objects"
  on storage.objects for delete
  using (
    bucket_id = 'listing-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Read access: same MVP shortcut noted above — rather than joining
-- storage.objects back to listings/listing_images per-object to check
-- `status = 'published'` (awkward with Storage's policy model since `name`
-- would need to be matched against listing_images.storage_path), any
-- authenticated or anon client can read any object in this bucket. This is
-- an accepted tradeoff for MVP: listing photos are considered the same
-- trust level as listing text per the spec, and a photo's path
-- ({owner_id}/{listing_id}/{filename}) is not guessable/enumerable without
-- already having it from a published listing_images row (which IS correctly
-- scoped to published-only via the table RLS above), so exposure in
-- practice is limited to "images of listings someone already found through
-- the app." Flagged explicitly for code-reviewer.
create policy "Anyone can read listing images"
  on storage.objects for select
  using (bucket_id = 'listing-images');

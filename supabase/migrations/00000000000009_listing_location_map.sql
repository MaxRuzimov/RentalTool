-- M17 (spec docs/design/location-map-spec.md): approximate location map on
-- the listing detail page. `listings.location` stays free text (unchanged,
-- still the field shown everywhere today) — this adds nullable coordinates
-- derived from that text via one-time geocoding at create/edit time (see
-- apps/web/src/lib/listings/geocode.ts), plus a cache table so repeated/
-- common location strings don't each cost a separate Nominatim lookup.

alter table public.listings
  add column lat double precision,
  add column lng double precision;

-- Both nullable: a listing with no successful geocode simply has no map
-- (§5.4) and this never blocks listing creation/editing (§3.4). Invariant
-- worth a check constraint: both-null or both-not-null (never one without
-- the other).
alter table public.listings
  add constraint listings_lat_lng_both_or_neither
  check ((lat is null) = (lng is null));

-- Caches a RAW (un-fuzzed) geocode result per normalized location string, so
-- two listings in "Etobicoke" (or the same listing re-geocoded on an
-- unrelated edit) don't each cost a Nominatim lookup. This is NOT where
-- privacy fuzzing happens (spec §4) — the jitter is applied per-listing, by
-- the caller, after reading from this cache, and the fuzzed point is never
-- written back here.
create table public.geocode_cache (
  location_key text primary key, -- normalized: trim + lowercase of the free-text location
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now()
);

alter table public.geocode_cache enable row level security;

-- Not sensitive data (a neighborhood-name -> public-landmark-level
-- coordinate pair, same precision OSM would give anyone querying its public
-- API), so any authenticated user's listing create/edit flow can read and
-- append to it. No update/delete policy: this is an append-only cache — a
-- bad entry is corrected via a migration/manual fix, not exposed as an app
-- write path.
create policy "Authenticated users can read the geocode cache"
  on public.geocode_cache for select
  to authenticated
  using (true);

create policy "Authenticated users can add geocode cache entries"
  on public.geocode_cache for insert
  to authenticated
  with check (true);

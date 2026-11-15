-- M16 (spec docs/design/video-upload-spec.md §8 addendum): close a gap
-- opened by moving listing photo/video uploads to client-direct Storage
-- writes. Previously, `MAX_IMAGES` (6 per listing) was enforced in
-- `createListing`/`updateListing` before any `listing_images` insert ever
-- ran, so the cap was "trusted because only our server action wrote rows".
-- Now that `listing_images` inserts happen directly from the browser
-- Supabase client, that server-side count check no longer runs in front of
-- every insert — RLS still correctly blocks a user from touching anyone
-- else's listing, but nothing stopped them from exceeding their own cap via
-- direct API calls. This trigger converts the cap into an actual
-- database-level invariant, following the same before-insert-trigger
-- pattern as `set_updated_at()` in 00000000000001_init_profiles.sql.
--
-- `listing_videos` doesn't need an equivalent trigger — its `unique` index
-- on `listing_id` (00000000000007_listing_videos.sql) already makes "at most
-- 1" a real DB-level invariant no matter who calls insert.
--
-- The `6` below must be kept in sync by hand with `MAX_IMAGES` in
-- apps/web/src/lib/listings/images.ts — same hand-sync convention this
-- codebase already uses for the `listing_category` enum vs.
-- apps/web/src/lib/listings/categories.ts (see 00000000000002_listings.sql).

-- Known, accepted MVP tradeoff: this is a classic count-then-insert race.
-- Two near-simultaneous inserts for the same listing_id can both run their
-- `select count(*)` before either commits, so both see e.g. count = 5 and
-- both pass the `>= 6` check, letting that listing end up with 7 rows. This
-- isn't closed with a `select ... for update` lock on the parent `listings`
-- row (which would serialize concurrent inserters and fix it), because the
-- normal UI flow is a single session uploading photos sequentially (see
-- uploadNewPhotos in apps/web/src/lib/listings/clientUpload.ts) — two
-- concurrent inserts for the same listing only happen if the same user (or
-- someone with access to their session) deliberately fires parallel direct
-- API calls, which is out of scope to harden against for MVP. Revisit if
-- multi-device/multi-tab concurrent editing of the same listing becomes a
-- real use case.
create function public.enforce_max_listing_images()
returns trigger
language plpgsql
as $$
declare
  current_count int;
begin
  select count(*) into current_count
  from public.listing_images
  where listing_id = new.listing_id;

  if current_count >= 6 then
    raise exception 'A listing can have at most 6 photos.';
  end if;

  return new;
end;
$$;

create trigger enforce_max_listing_images_trigger
  before insert on public.listing_images
  for each row execute procedure public.enforce_max_listing_images();

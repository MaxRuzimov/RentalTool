-- M16: listing video upload — `listing_videos` table, RLS, and Storage
-- policies for the `listing-videos` bucket. Spec: docs/design/video-upload-spec.md
-- §1/§2. Separate table + separate bucket from `listing_images` (not a
-- shared `media_type` column) — see spec §1 for the reasoning. Mirrors
-- `listing_images`' exact RLS/Storage-policy shape from
-- 00000000000002_listings.sql, substituting `listing_videos` /
-- `listing-videos` and dropping the `position` column (moot with a 0-or-1
-- cap).

create table public.listing_videos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

-- Cap: exactly 0 or 1 listing_videos row per listing_id (spec §1).
create unique index listing_videos_listing_id_key on public.listing_videos (listing_id);

alter table public.listing_videos enable row level security;

-- Owner of the parent listing can manage its video, regardless of listing status.
create policy "Owners can view their own listing videos"
  on public.listing_videos for select
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_videos.listing_id and l.owner_id = auth.uid()
    )
  );

create policy "Owners can insert their own listing videos"
  on public.listing_videos for insert
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_videos.listing_id and l.owner_id = auth.uid()
    )
  );

create policy "Owners can update their own listing videos"
  on public.listing_videos for update
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_videos.listing_id and l.owner_id = auth.uid()
    )
  );

create policy "Owners can delete their own listing videos"
  on public.listing_videos for delete
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_videos.listing_id and l.owner_id = auth.uid()
    )
  );

-- Public (anon + authenticated) can read the video of published listings —
-- mirrors listing_images' "anyone can view published" policy.
create policy "Anyone can view videos of published listings"
  on public.listing_videos for select
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_videos.listing_id and l.status = 'published'
    )
  );

-- ---------------------------------------------------------------------------
-- Storage: `listing-videos` bucket + storage.objects RLS.
--
-- Same private-bucket-plus-RLS-select pattern as `listing-images` (see that
-- bucket's comment in 00000000000002_listings.sql for the full rationale);
-- carried forward unchanged here (spec §2). 78643200 bytes = 75 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-videos', 'listing-videos', false, 78643200, array['video/mp4', 'video/quicktime'])
on conflict (id) do nothing;

-- Path convention: {owner_id}/{listing_id}/{filename}. Same accepted MVP
-- simplification as listing-images: ownership is enforced only on the first
-- path segment (owner_id), not the second (listing_id) — see the detailed
-- comment on the equivalent listing-images policies in
-- 00000000000002_listings.sql for the full reasoning, which applies
-- identically here.
create policy "Owners can upload their own listing videos"
  on storage.objects for insert
  with check (
    bucket_id = 'listing-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Owners can update their own listing video objects"
  on storage.objects for update
  using (
    bucket_id = 'listing-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Owners can delete their own listing video objects"
  on storage.objects for delete
  using (
    bucket_id = 'listing-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Read access: same MVP shortcut as listing-images — bucket-wide read rather
-- than a per-object join back to listings.status = 'published'. Flagged
-- explicitly for code-reviewer, as the images migration does.
create policy "Anyone can read listing videos"
  on storage.objects for select
  using (bucket_id = 'listing-videos');

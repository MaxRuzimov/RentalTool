-- M3: create the `listing-images` Storage bucket referenced by the
-- storage.objects RLS policies in 00000000000002_listings.sql. Bucket
-- creation is not something `supabase db push` derives from config.toml on
-- remote projects (that's local-dev-only seeding), so it must be its own
-- migration statement. Private bucket (public = false) — all read/write
-- access is authorized via the storage.objects RLS policies, not this flag.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-images', 'listing-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

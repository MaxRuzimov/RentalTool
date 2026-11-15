# Video Upload Spec (Listing Video, Web)

Status: ready for implementation
Scope: `apps/web` (Next.js 16 App Router + Tailwind v4), Supabase Postgres + Storage
Trigger: stakeholder feedback — "Video yuklay olmadim" (couldn't upload a video). Max wants to upload a short video alongside photos when creating/editing a listing.
Non-goals for this spec: mobile (Expo) listing creation of any kind (there is none — see `docs/design/m8-mobile-spec.md` §4.1), video on card grids, multi-video support, transcoding. Full list in §7.

## 0. Assumptions engineers should verify before starting

- M3 is merged: `listings` + `listing_images` tables/RLS, `listing-images` Storage bucket, and `<ListingForm>` all exist and work as documented in `docs/design/m3-listings-spec.md`. This spec reuses that exact RLS shape, path convention, and staged-upload UX pattern — it does not redesign them.
- This is a new, separate feature addition on top of M3, not a revision of it. It ships as its own migration (new table, new bucket) rather than altering `listing_images`.
- Same mutation pattern as M3: a single server action handles listing fields + photos + video together (one "Save"/"Publish" button, sequential upload steps are acceptable for MVP).

## 1. Data model — `listing_videos` table

A **separate table**, not an extension of `listing_images` (no shared `media_type` column). Reasoning: video has a materially different cap (1, not 6), a different size/duration validation path (client-side metadata read, not just size/type), and a different Storage bucket — conflating the two into one polymorphic table would make every query and policy need a `media_type` branch for no real benefit at this scale. Two small, single-purpose tables are simpler to reason about and cheaper to build correctly.

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | `uuid`, PK, default `gen_random_uuid()` | yes | |
| `listing_id` | `uuid`, references `listings(id)` on delete cascade | yes | |
| `storage_path` | `text` | yes | e.g. `{owner_id}/{listing_id}/{filename}` — full path within the `listing-videos` bucket |
| `created_at` | `timestamptz`, default `now()` | yes | |

No `position` column (unlike `listing_images`) — there is never more than one row, so ordering is moot.

### One video per listing (not six, like photos)

**Cap: exactly 0 or 1 `listing_videos` row per `listing_id`**, enforced with a unique constraint/index on `listing_id` (e.g. `create unique index listing_videos_listing_id_key on public.listing_videos (listing_id);`).

Reasoning: photos are cheap — a 6-photo cap at ≤5MB each is a bounded, small storage/egress cost per listing, and multiple angles genuinely help a buyer evaluate condition. Video is a different order of cost: even a single 60-second clip can be 10-20x the size of all 6 photos combined, and unlike photos (which only load their thumbnail on list views), a video is fetched in full whenever someone opens the detail page. A first pass at "show the tool in action" only needs one clip — a quick demo of it running/working — not a multi-angle video gallery. Capping at 1 keeps the feature additive and low-risk while still solving the actual stakeholder request; raising the cap later is a pure limit change (constant + constraint), not a schema break.

### RLS policies (mirrors `listing_images`' four-policy shape exactly)

```sql
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
```

Four owner-scoped policies (select/insert/update/delete, each via an `exists` join to `listings.owner_id`) plus one public-select policy gated on `status = 'published'` — identical shape to `listing_images` in `supabase/migrations/00000000000002_listings.sql`, just with `listing_videos` substituted.

## 2. Storage — `listing-videos` bucket

- Bucket name: `listing-videos` (separate from `listing-images` — different size/MIME limits, and keeping buckets single-purpose matches the existing `listing-images` precedent of one bucket per M3-era feature).
- Path convention: `{owner_id}/{listing_id}/{filename}` — identical to `listing-images`.
- Bucket creation migration (mirrors `00000000000003_listing_images_bucket.sql`):

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-videos', 'listing-videos', false, 78643200, array['video/mp4', 'video/quicktime'])
on conflict (id) do nothing;
```

(`78643200` bytes = 75 MB, matching §3's size limit.)

- Bucket is **private** (`public = false`); as with `listing-images`, the spec's intent is "public read" (a listing's video is the same trust level as its photos/text — anyone can view a published listing's video), but the implementation keeps the bucket non-public at the storage-provider level and grants reads via `storage.objects` RLS instead. This is the same documented simplification `00000000000002_listings.sql` uses for images, carried forward unchanged.
- `storage.objects` policies (mirrors `listing-images`' exact pattern, including the same accepted MVP tradeoff):

```sql
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

create policy "Anyone can read listing videos"
  on storage.objects for select
  using (bucket_id = 'listing-videos');
```

Same documented tradeoff as images: ownership is enforced only on the first path segment (`owner_id`), not the second (`listing_id`) — a signed-in user cannot write into another user's `owner_id` folder, but nothing at the Storage-policy layer stops them writing under a `listing_id` folder belonging to one of their *own* other listings, or a not-yet-existing `listing_id`. Accepted for the same reasons as the images migration: the app never lets a user pick an arbitrary `listing_id` (always one it just created/loaded for that owner), and the actual UI-facing data (`listing_videos` rows) is separately protected by the table RLS above, which does verify `listing_id` ownership via the join to `listings`. Likewise, public read access is granted bucket-wide rather than per-object-checked against `status = 'published'`, for the identical reason given in the images migration (awkward to join `storage.objects` back to listings per-object; a video's path is not guessable without already having it from a published `listing_videos` row, which *is* correctly scoped via table RLS). Flagged here explicitly for code-reviewer, as the images migration does.

- Local dev config (`supabase/config.toml`), mirroring `[storage.buckets.listing-images]`:

```toml
# Listing video (optional, 1 per listing). Private bucket — reads are
# authorized via storage.objects RLS policies (see the listing_videos
# migration), not the bucket-level `public` flag, same documented tradeoff
# as listing-images.
[storage.buckets.listing-videos]
public = false
file_size_limit = "75MiB"
allowed_mime_types = ["video/mp4", "video/quicktime"]
```

## 3. Limits and constraints

| Rule | Value | Reasoning |
|---|---|---|
| Max videos per listing | 1 | See §1 — video's storage/bandwidth cost per unit is far higher than a photo's; one clip is enough to show the tool in action for a first pass. |
| Max file size | 75 MB | Generous enough to fit a realistic 30-60 second phone-camera clip at typical modern compression (a 60s H.264 clip at common phone bitrates is usually well under this), while still capping worst-case per-upload storage and egress exposure — an unbounded or very high limit would let a single listing's video cost far more than its 6 photos combined. |
| Max duration | 60 seconds | Enough to demonstrate a tool running/in use without inviting long, unedited walkthrough footage that balloons storage/egress for no added buyer value. Enforced **client-side only**: read the file's duration from an offscreen `<video>` element's `loadedmetadata` event (`video.duration`) before upload; if it exceeds 60s, reject with an inline message and do not stage the file. There is no server-side duration check for MVP (would require probing the video server-side, e.g. ffprobe, which this project's "no new dependencies unless justified" convention argues against for a first pass) — this is a client-side-only soft limit, not a hard security boundary, consistent with this being a UX guard rather than an abuse-prevention mechanism. |
| Accepted types | `video/mp4` (`.mp4`), `video/quicktime` (`.mov`) | The two container formats iOS and Android camera apps actually produce by default — covers the realistic case (a phone video) without trying to support arbitrary web video formats. |
| Minimum required to publish | 0 — optional | Same "optional, don't block publishing" philosophy as photos (M3 §4): a listing with no video is fully valid; the feature is additive, not a new requirement. |

### Defense-in-depth (same pattern as M3 images — call this out for code-reviewer)

Client-side validation (type, extension, size, duration) is for fast, friendly feedback only and is **not** the real enforcement boundary. Real MIME-type and size enforcement is the `listing-videos` Storage bucket's `allowed_mime_types` / `file_size_limit` config (§2) — a malicious or buggy client that bypasses the UI validation still cannot upload an oversized or wrong-type file, because the Storage layer rejects it. Duration is the one exception with no server-side backstop (see table above) — flagged explicitly since this is a deliberate, scoped-down deviation from the "always have a server-side check" pattern, acceptable here because an over-long video only costs extra storage/bandwidth (already bounded by the 75MB size cap), not a security exposure.

Client-side constants should live alongside the existing image ones, e.g. `apps/web/src/lib/listings/video.ts`, mirroring `images.ts`'s shape:

```ts
export const MAX_VIDEOS = 1;
export const MAX_VIDEO_FILE_SIZE_BYTES = 75 * 1024 * 1024;
export const MAX_VIDEO_DURATION_SECONDS = 60;
export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/quicktime"] as const;
export const ACCEPTED_VIDEO_EXTENSIONS = [".mp4", ".mov"];
export const VIDEO_ACCEPT_ATTR = "video/mp4,video/quicktime";
```

## 4. UI placement — create/edit form

A separate **"Video (optional)"** section, placed directly below the existing Photos section (same form, after the photo grid, before the submit button) — not merged into the photo grid. A single video is conceptually different from a set of photos (one slot vs. a multi-item grid), so it gets its own clearly-labeled block rather than being just another thumbnail type mixed into the photo grid.

### Layout (mirrors the photo section's visual language)

- Section label: "Video (optional)", styled identically to the "Photos" label above it (`text-sm font-medium`).
- Helper text below the label, styled like the photos helper text: "Show the tool in action — up to 60 seconds." (new copy; optional nudge, not required).
- Below the helper text: a single dashed-border upload control, same visual treatment as the existing "Add photos" box (`border-2 border-dashed border-line-strong`, same height/hover state), labeled **"Add video"**. A native `<input type="file" accept="video/mp4,video/quicktime">` behind it (no `multiple` — only one video is ever accepted).
- Once a video is selected (or, in edit mode, already exists): the "Add video" control is replaced by a single inline `<video controls>` preview (not a thumbnail grid — there's only ever one item), sized consistently with the form width (e.g. full-width within the form card, capped aspect ratio `16:9`, `max-h-64` or similar). A small "×" remove button sits in the preview's top-right corner, same convention and same component (`X` icon in a circular dark-overlay button) as photo thumbnails.
- While a video is staged, the "Add video" control is hidden/disabled entirely (there's nothing to add a second of, per the 1-video cap) rather than showing a "Maximum 1 video" message — simpler than the photo cap's "disable + show message" treatment since there's no scenario where a user is trying to add a 2nd before removing the 1st (the control just isn't there).

### Client-side validation on selection

- Reject (inline message, same style as photo rejections, e.g. "clip.avi is not a supported video type — skipped.") anything not `video/mp4`/`video/quicktime` by type or extension.
- Reject (e.g. "video.mov is larger than 75MB — skipped.") anything over the size cap.
- Read duration via an offscreen `<video>` element's `loadedmetadata` event; if `> 60` seconds, reject (e.g. "Videos must be 60 seconds or shorter — skipped.") and do not stage it.
- All three checks happen before the file is accepted into state — a rejected file never reaches the preview/staged-video slot.

### Staged-removal semantics (reference M3 §4, don't re-derive)

Identical pattern to photos: in edit mode, if the video already exists (has a `listing_videos` row), clicking "×" queues it for removal — it's only actually deleted from Storage + the table on form submit, so navigating away without saving leaves it untouched. If the video was newly added this session (not yet uploaded), removing it just clears it from in-memory state with no network call. Exactly the same semantics as M3 §4's photo removal, just with a single item instead of a list.

### Submit behavior

Same single-submit-action pattern as M3: the video (if staged) uploads to the `listing-videos` bucket under `{owner_id}/{listing_id}/{uuid-filename}` and a `listing_videos` row is inserted, inside the same server action that saves listing fields, uploads photos, and inserts/removes `listing_images` rows. Sequential is fine for MVP — no parallelization, consistent with M3's precedent for photos. While the video is uploading, extend the existing "Uploading photos…" indicator text to also cover video (e.g. "Uploading photos and video…" when both are pending, or a second line "Uploading video…" — exact wording is a copy detail, either is acceptable) and keep the submit button disabled, same as the existing uploading state.

If video upload fails after the listing row was already created (same failure mode M3 §5.1 documents for photos): do not roll back the listing or the photos; show the same kind of specific inline note, e.g. "Listing published, but the video failed to upload. You can add a video from the edit page." and still redirect to the listing.

## 5. Detail page — `/listings/[id]`

Render the video below the existing photo gallery section (cover image + thumbnail strip, per M3 §5.5), using a plain native tag:

```html
<video controls preload="metadata" src="...">
```

No player library, no custom controls, no lightbox — this project's established "no new dependencies unless justified" convention (same reasoning M3 §5.5 gives for not using a carousel component for photos). `preload="metadata"` avoids eagerly downloading the full file just for someone scrolling past; the browser's native controls (play/pause/scrub/volume/fullscreen) are sufficient.

If the listing has no video, this section is simply omitted (no placeholder box) — unlike photos, which show a placeholder when empty (per M3 §5.5), a video section with no video has no equivalent "there's supposed to be something here" expectation, so nothing renders.

## 6. Cost/bandwidth flag (heads-up for the stakeholder)

**This subsection is informational — not a blocker to building — but worth relaying to Max as a heads-up.**

Today, photos average well under 1MB each with a hard ceiling of 6 photos × 5MB = 30MB worst case per listing, and only the cover/thumbnail images are fetched on list views (full-size photos only load on the detail page). Video changes that math meaningfully: a single listing can now carry up to a 75MB file, and because the detail page always serves the full video (there's no separate "thumbnail" tier for video — the whole file streams whenever someone opens the page and presses play, and `preload="metadata"` still means the full file is fetched on playback), this is an order-of-magnitude-plus increase in both per-listing storage and per-view egress compared to photos alone.

This uses the already-provisioned Supabase project — it is not a new paid service or infrastructure addition — and the feature is optional/capped (0 or 1 video, 75MB max), so the worst case is bounded. But if video adoption among listing owners turns out to be high, Supabase Storage egress costs could become meaningfully more visible than they've been so far relative to the image-only baseline. This is worth monitoring after launch (e.g. checking Storage egress/usage in the Supabase dashboard periodically once this ships), not something that needs to be solved before shipping it.

## 7. Non-goals (explicit)

- **Video thumbnail/poster generation** — no server-side frame extraction or custom poster image. Relies on the browser's native no-poster/first-frame behavior for the `<video>` element, or simply omits a `poster` attribute. Generating a poster would require either server-side processing (ffmpeg) or an extra client-side canvas-capture step — both unjustified complexity for a capped, optional, 1-video MVP feature.
- **Server-side transcoding/compression** — videos are stored and served exactly as uploaded (within the type/size/duration caps above). No re-encoding pipeline, no adaptive bitrate, no format normalization.
- **Multi-video support** — explicitly capped at 1 per listing (see §1's reasoning). Raising this later is a pure limit/constraint change, not a schema break.
- **Video on mobile app** — the Expo mobile app has no listing creation/editing screens at all (`docs/design/m8-mobile-spec.md` §4.1 defers the entire CRUD flow, photo upload included); video is therefore equally out of scope there. This spec covers `apps/web` only, including when accessed from a phone's mobile browser (which is how the original stakeholder report — "I want to upload video... instead of taking a photo" — was actually reproduced).
- **Drag-reorder** — moot with only one video slot.
- **Lightbox / custom video player chrome** — plain native `<video controls>`, no player library, no fullscreen-gallery component, consistent with M3's "no carousel component" precedent for photos.
- **Video on card grids** (`/listings`, `/listings/mine`) — cards remain image-only (cover photo or placeholder) for MVP; this is a deliberate scope cut, not an oversight. Reasoning: card grids are a "scan many listings quickly" view where loading/playing video per card would be expensive and distracting at list-view scale; video is reserved for the detail page where a visitor has already expressed interest in one specific listing.

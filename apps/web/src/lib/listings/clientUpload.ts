import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Client-direct Storage upload/removal helpers for listing photos and video
 * (docs/design/video-upload-spec.md §8 addendum).
 *
 * These run entirely in the browser via the caller-supplied Supabase client
 * (the signed-in user's own session) — `supabase.storage.from(...).upload()`
 * and `supabase.from(...).insert()/delete()` go straight to Supabase's
 * Storage/Data APIs, never through this app's Next.js server. The existing
 * `storage.objects` RLS policies (owner-scoped insert/update/delete via
 * `auth.uid()` matching the path's first segment) and the
 * `listing_images`/`listing_videos` table RLS (owner-scoped via a join to
 * `listings.owner_id`) are the real authorization boundary — see
 * supabase/migrations/00000000000002_listings.sql and
 * 00000000000007_listing_videos.sql. Moving this logic client-side only
 * changes which process initiates the HTTP calls; nothing about what's
 * allowed to happen changes. This is a straight port of the logic that used
 * to live inside `createListing`/`updateListing` in
 * `@/app/listings/actions.ts` before the §8 addendum.
 */

function extensionFor(file: File): string {
  const fromName = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
  if (fromName) return fromName.toLowerCase();
  if (file.type === "image/png") return ".png";
  if (file.type === "image/webp") return ".webp";
  return ".jpg";
}

function videoExtensionFor(file: File): string {
  const fromName = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
  if (fromName) return fromName.toLowerCase();
  if (file.type === "video/quicktime") return ".mov";
  return ".mp4";
}

/**
 * Uploads any newly-added photo files to the `listing-images` bucket and
 * inserts their `listing_images` rows. Runs sequentially, not in parallel —
 * same MVP tradeoff the pre-§8 server-side version used. Returns the count
 * of files that failed to upload/insert so the caller can surface the
 * "published, but some photos failed" note without rolling back the listing
 * itself.
 */
async function uploadNewPhotos(
  supabase: SupabaseClient,
  ownerId: string,
  listingId: string,
  files: File[],
  startPosition: number,
): Promise<{ failedCount: number }> {
  let failedCount = 0;
  let position = startPosition;

  for (const file of files) {
    if (!file || file.size === 0) continue;

    const path = `${ownerId}/${listingId}/${crypto.randomUUID()}${extensionFor(file)}`;
    const { error: uploadError } = await supabase.storage
      .from("listing-images")
      .upload(path, file, { contentType: file.type || "application/octet-stream" });

    if (uploadError) {
      console.error("listing photo upload failed", uploadError);
      failedCount += 1;
      continue;
    }

    const { error: rowError } = await supabase
      .from("listing_images")
      .insert({ listing_id: listingId, storage_path: path, position });

    if (rowError) {
      console.error("listing_images insert failed", rowError);
      failedCount += 1;
      // Clean up the now-orphaned storage object rather than leaving a file
      // with no DB row pointing at it.
      await supabase.storage.from("listing-images").remove([path]);
      continue;
    }

    position += 1;
  }

  return { failedCount };
}

/**
 * Reconciles a listing's `listing_images` rows with the form's current
 * staged state, then uploads newly-added files. Removes any existing image
 * the user queued for removal (Storage object + table row), renumbers the
 * surviving kept images to contiguous positions 0..k-1 in their existing
 * relative order (without this, removing a non-last image — especially
 * position 0, the cover image — leaves gaps: no image ends up at position 0,
 * which breaks the cover-photo queries on /listings and /listings/mine), and
 * finally uploads any new files starting right after the kept images.
 *
 * Safe to call for both create and edit: in create mode `keptImageIds` is
 * always empty and the listing has no existing `listing_images` rows yet,
 * so the fetch/diff/renumber steps are all no-ops.
 */
async function syncImages(
  supabase: SupabaseClient,
  ownerId: string,
  listingId: string,
  keptImageIds: string[],
  newPhotoFiles: File[],
): Promise<{ failedCount: number }> {
  const { data: currentImages } = await supabase
    .from("listing_images")
    .select("id, storage_path, position")
    .eq("listing_id", listingId);

  const toRemove = (currentImages ?? []).filter((img) => !keptImageIds.includes(img.id));
  if (toRemove.length > 0) {
    await supabase.storage
      .from("listing-images")
      .remove(toRemove.map((img) => img.storage_path));
    await supabase
      .from("listing_images")
      .delete()
      .in(
        "id",
        toRemove.map((img) => img.id),
      );
  }

  const keptImagesInOrder = (currentImages ?? [])
    .filter((img) => keptImageIds.includes(img.id))
    .sort((a, b) => a.position - b.position);

  for (let i = 0; i < keptImagesInOrder.length; i++) {
    if (keptImagesInOrder[i].position !== i) {
      await supabase.from("listing_images").update({ position: i }).eq("id", keptImagesInOrder[i].id);
    }
  }

  return uploadNewPhotos(supabase, ownerId, listingId, newPhotoFiles, keptImageIds.length);
}

/**
 * Uploads a newly-staged video to the `listing-videos` bucket and inserts
 * its `listing_videos` row. Mirrors uploadNewPhotos' shape, adapted for a
 * single optional file instead of a list. Caller is responsible for
 * removing any prior video row/object first (see removeExistingVideo) since
 * `listing_videos` enforces at most one row per listing.
 */
async function uploadVideo(
  supabase: SupabaseClient,
  ownerId: string,
  listingId: string,
  file: File,
): Promise<{ failed: boolean }> {
  const path = `${ownerId}/${listingId}/${crypto.randomUUID()}${videoExtensionFor(file)}`;
  const { error: uploadError } = await supabase.storage
    .from("listing-videos")
    .upload(path, file, { contentType: file.type || "application/octet-stream" });

  if (uploadError) {
    console.error("listing video upload failed", uploadError);
    return { failed: true };
  }

  const { error: rowError } = await supabase
    .from("listing_videos")
    .insert({ listing_id: listingId, storage_path: path });

  if (rowError) {
    console.error("listing_videos insert failed", rowError);
    // Clean up the now-orphaned storage object rather than leaving a file
    // with no DB row pointing at it (same pattern as uploadNewPhotos).
    await supabase.storage.from("listing-videos").remove([path]);
    return { failed: true };
  }

  return { failed: false };
}

/**
 * Deletes a listing's existing `listing_videos` row + Storage object, if
 * any. Used both for explicit removal and as the "replace" step before
 * uploading a new video over an existing one.
 */
async function removeExistingVideo(supabase: SupabaseClient, listingId: string): Promise<void> {
  const { data: existing } = await supabase
    .from("listing_videos")
    .select("id, storage_path")
    .eq("listing_id", listingId)
    .maybeSingle();

  if (!existing) return;

  await supabase.storage.from("listing-videos").remove([existing.storage_path]);
  await supabase.from("listing_videos").delete().eq("id", existing.id);
}

export type VideoSyncInstruction =
  | { kind: "none" }
  | { kind: "new"; file: File }
  | { kind: "remove" };

export type MediaSyncResult = { photosFailed: boolean; videoFailed: boolean };

export type MediaSyncParams = {
  ownerId: string;
  listingId: string;
  /** Ids of existing (already-uploaded) photos the user kept, in display order. */
  keptImageIds: string[];
  /** Newly-staged photo files to upload, in the order they should be appended. */
  newPhotoFiles: File[];
  video: VideoSyncInstruction;
};

/**
 * Single entry point `ListingForm` calls, right after a successful
 * fields-only `createListing`/`updateListing`, to perform every
 * client-direct Storage upload/removal for that submit (spec §8 "New submit
 * flow"). Returns per-media-type pass/fail so the caller can build the same
 * "published, but some photos/video failed" redirect query params the
 * pre-§8 server-side code did.
 */
export async function syncListingMedia(
  supabase: SupabaseClient,
  params: MediaSyncParams,
): Promise<MediaSyncResult> {
  const { ownerId, listingId, keptImageIds, newPhotoFiles, video } = params;

  const { failedCount } = await syncImages(supabase, ownerId, listingId, keptImageIds, newPhotoFiles);
  const photosFailed = failedCount > 0;

  let videoFailed = false;
  if (video.kind === "new") {
    await removeExistingVideo(supabase, listingId);
    const { failed } = await uploadVideo(supabase, ownerId, listingId, video.file);
    videoFailed = failed;
  } else if (video.kind === "remove") {
    await removeExistingVideo(supabase, listingId);
  }

  return { photosFailed, videoFailed };
}

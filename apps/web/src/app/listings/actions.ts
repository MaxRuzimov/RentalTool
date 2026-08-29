"use server";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { LISTING_CATEGORIES, PRICE_UNITS } from "@/lib/listings/categories";

export type ListingActionState = {
  status: "idle" | "error";
  message?: string;
};

export const initialListingActionState: ListingActionState = { status: "idle" };

const CATEGORY_VALUES = new Set<string>(LISTING_CATEGORIES.map((c) => c.value));
const PRICE_UNIT_VALUES = new Set<string>(PRICE_UNITS.map((u) => u.value));

type ParsedListingFields = {
  title: string;
  description: string;
  category: string;
  price_amount: number;
  price_unit: string;
  location: string;
};

/**
 * Shared field validation for create + edit (spec §5.1/§5.2 "same field
 * set, same validation"). Mirrors the client-side checks in ListingForm but
 * is the actual security/data-integrity boundary — the DB check constraints
 * in the M3 migration are a second backstop, not a substitute for this.
 */
function parseListingFields(formData: FormData): { values: ParsedListingFields } | { error: string } {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const priceAmountRaw = String(formData.get("price_amount") ?? "").trim();
  const price_unit = String(formData.get("price_unit") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();

  if (!title || title.length > 100) {
    return { error: "Title is required and must be 100 characters or fewer." };
  }
  if (!description || description.length > 2000) {
    return { error: "Description is required and must be 2000 characters or fewer." };
  }
  if (!CATEGORY_VALUES.has(category)) {
    return { error: "Please select a category." };
  }
  const price_amount = Number(priceAmountRaw);
  if (!Number.isFinite(price_amount) || price_amount <= 0) {
    return { error: "Price must be a number greater than 0." };
  }
  if (!PRICE_UNIT_VALUES.has(price_unit)) {
    return { error: "Please select a price unit." };
  }
  if (!location) {
    return { error: "Location is required." };
  }

  return {
    values: { title, description, category, price_amount, price_unit, location },
  };
}

function extensionFor(file: File): string {
  const fromName = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
  if (fromName) return fromName.toLowerCase();
  if (file.type === "image/png") return ".png";
  if (file.type === "image/webp") return ".webp";
  return ".jpg";
}

/**
 * Uploads any newly-added photo files to the `listing-images` bucket and
 * inserts their `listing_images` rows (spec §4 "on form submit"). Runs
 * sequentially, not in parallel, per spec §4's note that this is acceptable
 * for MVP. Returns the count of files that failed to upload/insert so the
 * caller can surface the "published, but some photos failed" note (§5.1)
 * without rolling back the listing itself.
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
    // A file input with nothing selected can still submit a single empty
    // File entry (empty name, zero size) depending on the browser — skip it
    // rather than trying to upload it.
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
      // Clean up the now-orphaned storage object rather than leaving a
      // file with no DB row pointing at it.
      await supabase.storage.from("listing-images").remove([path]);
      continue;
    }

    position += 1;
  }

  return { failedCount };
}

/**
 * Creates a new listing (spec §5.1). `owner_id` is always taken from the
 * authenticated session, never from client input.
 */
export async function createListing(formData: FormData): Promise<ListingActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Your session has expired. Please log in again." };
  }

  const parsed = parseListingFields(formData);
  if ("error" in parsed) {
    return { status: "error", message: parsed.error };
  }

  const { data: listing, error } = await supabase
    .from("listings")
    .insert({ owner_id: user.id, ...parsed.values })
    .select("id")
    .single();

  if (error || !listing) {
    console.error(error);
    return { status: "error", message: "Could not publish your listing. Please try again." };
  }

  const newPhotos = formData.getAll("new_photos").filter((f): f is File => f instanceof File);
  const { failedCount } = await uploadNewPhotos(supabase, user.id, listing.id, newPhotos, 0);

  if (failedCount > 0) {
    redirect(`/listings/${listing.id}?photoError=1`);
  }

  redirect(`/listings/${listing.id}`);
}

/**
 * Updates an existing listing (spec §5.2). RLS's owner-only update policy is
 * the real authorization boundary; the explicit ownership check here is just
 * what lets us return a friendly error instead of a silent RLS no-op.
 */
export async function updateListing(
  listingId: string,
  formData: FormData,
): Promise<ListingActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Your session has expired. Please log in again." };
  }

  const { data: existing } = await supabase
    .from("listings")
    .select("id, owner_id")
    .eq("id", listingId)
    .maybeSingle();

  if (!existing || existing.owner_id !== user.id) {
    return { status: "error", message: "You do not have permission to edit this listing." };
  }

  const parsed = parseListingFields(formData);
  if ("error" in parsed) {
    return { status: "error", message: parsed.error };
  }

  const { error } = await supabase.from("listings").update(parsed.values).eq("id", listingId);

  if (error) {
    console.error(error);
    return { status: "error", message: "Could not save changes. Please try again." };
  }

  // Images the user kept in the preview grid (in display order); anything
  // in listing_images not in this set was removed client-side and should be
  // deleted from Storage + the table now (spec §4 "removal is queued...
  // only actually deleted ... on form submit").
  const keptImageIds = formData.getAll("kept_image_id").map(String);

  const { data: currentImages } = await supabase
    .from("listing_images")
    .select("id, storage_path")
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

  const newPhotos = formData.getAll("new_photos").filter((f): f is File => f instanceof File);
  const { failedCount } = await uploadNewPhotos(
    supabase,
    user.id,
    listingId,
    newPhotos,
    keptImageIds.length,
  );

  if (failedCount > 0) {
    redirect(`/listings/${listingId}?photoError=1`);
  }

  redirect(`/listings/${listingId}`);
}

/**
 * Deletes a listing (spec §5.2/§5.3 delete flow): removes the Storage
 * objects for that listing's folder, then deletes the `listings` row (RLS
 * owner-only delete policy is the real authorization; `listing_images` rows
 * cascade automatically via the FK). Shared by the edit page's "Delete
 * listing" button and /listings/mine's inline delete action.
 */
export async function deleteListing(listingId: string): Promise<ListingActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Your session has expired. Please log in again." };
  }

  const { data: existing } = await supabase
    .from("listings")
    .select("id, owner_id")
    .eq("id", listingId)
    .maybeSingle();

  if (!existing || existing.owner_id !== user.id) {
    return { status: "error", message: "You do not have permission to delete this listing." };
  }

  const { data: images } = await supabase
    .from("listing_images")
    .select("storage_path")
    .eq("listing_id", listingId);

  const { error } = await supabase.from("listings").delete().eq("id", listingId);

  if (error) {
    console.error(error);
    return { status: "error", message: "Could not delete this listing. Please try again." };
  }

  if (images && images.length > 0) {
    await supabase.storage
      .from("listing-images")
      .remove(images.map((img) => img.storage_path));
  }

  redirect("/listings/mine");
}

"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LISTING_CATEGORIES, PRICE_UNITS } from "@/lib/listings/categories";

/**
 * docs/design/video-upload-spec.md §8 addendum: createListing/updateListing
 * are fields-only now — no file bytes travel through these Server Actions
 * (Vercel's non-configurable 4.5MB Function body limit made the old
 * "upload photos/video inside the Server Action" design non-functional in
 * production). On success they hand back the listing id instead of
 * redirecting themselves; ListingForm uploads any staged photos/video
 * straight from the browser to Supabase Storage (see
 * `@/lib/listings/clientUpload`) and only then navigates to the listing.
 */
export type ListingActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; listingId: string };

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

/**
 * Creates a new listing (spec §5.1, fields only per §8 addendum). `owner_id`
 * is always taken from the authenticated session, never from client input.
 * Returns the new listing's id on success — it's the caller's (ListingForm's)
 * job to upload any staged photos/video and navigate afterward; this action
 * never touches Storage and never redirects.
 *
 * M14 fix (still applies): the whole body runs inside a try/catch so a
 * genuinely unexpected failure (a network error/timeout talking to Supabase,
 * etc.) that isn't already surfaced as a checked `{ data, error }` result
 * below is returned as a friendly error instead of throwing all the way out
 * of this Server Action (see ListingForm's matching client-side try/catch).
 */
export async function createListing(formData: FormData): Promise<ListingActionState> {
  const supabase = await createClient();

  try {
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

    return { status: "success", listingId: listing.id };
  } catch (err) {
    console.error("createListing: unexpected error", err);
    return { status: "error", message: "Could not publish your listing. Please try again." };
  }
}

/**
 * Updates an existing listing's fields (spec §5.2, fields only per §8
 * addendum). RLS's owner-only update policy is the real authorization
 * boundary; the explicit ownership check here is just what lets us return a
 * friendly error instead of a silent RLS no-op. Returns success (not a
 * redirect) so the caller can run its client-direct media sync first — see
 * createListing's comment above for the shared reasoning.
 *
 * M14 fix (still applies): same try/catch shape as createListing above.
 */
export async function updateListing(
  listingId: string,
  formData: FormData,
): Promise<ListingActionState> {
  const supabase = await createClient();

  try {
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

    return { status: "success", listingId };
  } catch (err) {
    console.error("updateListing: unexpected error", err);
    return { status: "error", message: "Could not save changes. Please try again." };
  }
}

/**
 * Deletes a listing (spec §5.2/§5.3 delete flow): removes the Storage
 * objects for that listing's folder, then deletes the `listings` row (RLS
 * owner-only delete policy is the real authorization; `listing_images`/
 * `listing_videos` rows cascade automatically via the FK). Shared by the
 * edit page's "Delete listing" button and /listings/mine's inline delete
 * action.
 *
 * Unlike createListing/updateListing, this stays a single server-side action
 * (spec §8 addendum): it only ever removes storage objects that were already
 * uploaded (small path/metadata reads + a removal call), never uploads new
 * file bytes, so it never risks the Vercel Function body-size ceiling that
 * motivated moving uploads client-side.
 *
 * M14 fix: same try/catch-around-everything-but-`redirect()` shape as
 * before — `redirect()` deliberately stays OUTSIDE the try block since it
 * works by throwing a special Next.js control-flow error internally, and a
 * blanket catch would otherwise swallow that and turn a successful delete
 * into a false "something went wrong" error.
 */
export async function deleteListing(listingId: string): Promise<ListingActionState> {
  const supabase = await createClient();

  try {
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

    const { data: video } = await supabase
      .from("listing_videos")
      .select("storage_path")
      .eq("listing_id", listingId)
      .maybeSingle();

    const { error } = await supabase.from("listings").delete().eq("id", listingId);

    if (error) {
      console.error(error);
      return { status: "error", message: "Could not delete this listing. Please try again." };
    }

    if (video) {
      await supabase.storage.from("listing-videos").remove([video.storage_path]);
    }

    if (images && images.length > 0) {
      await supabase.storage
        .from("listing-images")
        .remove(images.map((img) => img.storage_path));
    }
  } catch (err) {
    console.error("deleteListing: unexpected error", err);
    return { status: "error", message: "Could not delete this listing. Please try again." };
  }

  redirect("/listings/mine");
}

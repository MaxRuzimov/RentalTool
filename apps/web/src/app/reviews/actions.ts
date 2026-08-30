"use server";

import { createClient } from "@/lib/supabase/server";
import { todayISODate } from "@/lib/bookings/pricing";

export type ReviewActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

// Exact copy strings from spec §11. Not exported — every export from a
// "use server" file must be an async function (see the task's bug-class
// (a) warning), so this stays a module-local const.
const COPY = {
  sessionExpired: "Your session has expired. Please log in again.",
  notEligible: "This booking isn't eligible for a review yet.",
  duplicate: "You've already reviewed this booking.",
  noRating: "Please choose a star rating.",
  commentTooLong: "Comment must be 500 characters or less.",
  genericError: "Could not submit your review. Please try again.",
};

/**
 * Creates a review for an eligible, completed booking (spec §7.2). Re-checks
 * everything RLS also enforces (defense-in-depth, same convention as every
 * prior milestone's actions) — auth, booking ownership/status/date,
 * duplicate-review, rating range, comment length — and only THEN inserts,
 * so a request that fails any check never partially commits a row first
 * (bug class explicitly called out for this task). `listing_id`/`renter_id`
 * are always derived server-side from the booking, never client input —
 * same "never trust client input for an ownership/relationship column"
 * convention as `listings.owner_id`/`bookings.renter_id`.
 */
export async function createReview(
  bookingId: string,
  formData: FormData,
): Promise<ReviewActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: COPY.sessionExpired };
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, listing_id, renter_id, status, end_date")
    .eq("id", bookingId)
    .maybeSingle();

  // Exact eligibility predicate from spec §2, mirrored identically here, in
  // the RLS WITH CHECK, and in the /bookings/mine row-state query: status =
  // 'approved' and end_date < today (not <=, and not gated on start_date).
  const eligible =
    booking !== null &&
    booking !== undefined &&
    booking.renter_id === user.id &&
    booking.status === "approved" &&
    booking.end_date < todayISODate();

  if (!eligible) {
    return { status: "error", message: COPY.notEligible };
  }

  const { data: existingReview } = await supabase
    .from("reviews")
    .select("id")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (existingReview) {
    return { status: "error", message: COPY.duplicate };
  }

  const ratingRaw = String(formData.get("rating") ?? "");
  const rating = Number.parseInt(ratingRaw, 10);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { status: "error", message: COPY.noRating };
  }

  const commentRaw = String(formData.get("comment") ?? "").trim();
  if (commentRaw.length > 500) {
    return { status: "error", message: COPY.commentTooLong };
  }
  const comment = commentRaw.length > 0 ? commentRaw : null;

  // All validation above has fully resolved before this INSERT runs.
  const { error } = await supabase.from("reviews").insert({
    booking_id: bookingId,
    listing_id: booking.listing_id,
    renter_id: user.id,
    rating,
    comment,
  });

  if (error) {
    console.error(error);
    return { status: "error", message: COPY.genericError };
  }

  return { status: "success" };
}

/**
 * Review creation — direct port of `apps/web/src/app/reviews/actions.ts`'s
 * logic and exact copy (spec §11), run on-device against the RN Supabase
 * client instead of a server action. Same note as bookings/actions.ts: RLS +
 * the `unique` constraint on `reviews.booking_id` are the real boundary, the
 * pre-checks below just produce the same friendly copy as web.
 */
import { supabase } from "@/lib/supabase/client";
import { todayISODate } from "@/lib/bookings/pricing";

export type ReviewActionState = { status: "success" } | { status: "error"; message: string };

const COPY = {
  sessionExpired: "Your session has expired. Please log in again.",
  notEligible: "This booking isn't eligible for a review yet.",
  duplicate: "You've already reviewed this booking.",
  noRating: "Please choose a star rating.",
  commentTooLong: "Comment must be 500 characters or less.",
  genericError: "Could not submit your review. Please try again.",
};

export async function createReview(
  bookingId: string,
  rating: number,
  comment: string,
): Promise<ReviewActionState> {
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

  const eligible =
    booking !== null &&
    booking !== undefined &&
    booking.renter_id === user.id &&
    booking.status === "approved" &&
    booking.end_date < todayISODate();

  if (!eligible || !booking) {
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

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { status: "error", message: COPY.noRating };
  }

  const commentTrimmed = comment.trim();
  if (commentTrimmed.length > 500) {
    return { status: "error", message: COPY.commentTooLong };
  }
  const finalComment = commentTrimmed.length > 0 ? commentTrimmed : null;

  const { error } = await supabase.from("reviews").insert({
    booking_id: bookingId,
    listing_id: booking.listing_id,
    renter_id: user.id,
    rating,
    comment: finalComment,
  });

  if (error) {
    if (error.code === "23505") {
      return { status: "error", message: COPY.duplicate };
    }
    console.error(error);
    return { status: "error", message: COPY.genericError };
  }

  return { status: "success" };
}

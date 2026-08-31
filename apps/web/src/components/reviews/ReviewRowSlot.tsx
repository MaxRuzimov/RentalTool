"use client";

import { useState } from "react";
import StarRating from "./StarRating";
import ReviewForm from "./ReviewForm";

export type ExistingReview = { rating: number; comment: string | null };

/**
 * The review affordance rendered in `BookingListingRow`'s `contact` slot on
 * `/bookings/mine` (spec §7.1) — three states, in priority order:
 *
 * 1. Already reviewed (`review` prop set): read-only "Your review" summary.
 *    Takes priority over `eligible` since after a successful submit the
 *    parent server component re-renders with `review` populated regardless
 *    of this component's local `expanded` toggle state.
 * 2. Eligible, not yet reviewed (`eligible` prop true): "Leave a review"
 *    button that expands to the inline `ReviewForm` in place.
 * 3. Not yet eligible: renders nothing — the parent only mounts this
 *    component at all when `eligible || review`, but the guard is repeated
 *    here as a safe default.
 */
export default function ReviewRowSlot({
  bookingId,
  eligible,
  review,
}: {
  bookingId: string;
  eligible: boolean;
  review: ExistingReview | null;
}) {
  const [expanded, setExpanded] = useState(false);

  if (review) {
    return (
      <div className="mt-2">
        <div className="flex items-center gap-2">
          <StarRating rating={review.rating} size="sm" />
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Your review</span>
        </div>
        {review.comment && <p className="mt-1 text-sm text-foreground">{review.comment}</p>}
      </div>
    );
  }

  if (!eligible) {
    return null;
  }

  if (!expanded) {
    return (
      <div className="mt-2">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-sm font-medium text-accent underline-offset-2 hover:underline hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
        >
          Leave a review
        </button>
      </div>
    );
  }

  return <ReviewForm bookingId={bookingId} onCancel={() => setExpanded(false)} />;
}

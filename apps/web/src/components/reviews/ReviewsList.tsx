import StarRating from "./StarRating";
import { TARGET_MARKET_TIME_ZONE } from "@/lib/bookings/pricing";

// Formatted in the target market's local zone (not UTC) so a review left in
// the evening in Toronto doesn't display under the next calendar day — same
// day-boundary reasoning as pricing.ts's todayISODate().
const MONTH_DAY_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: TARGET_MARKET_TIME_ZONE,
});

export type ReviewListItem = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  reviewerName: string | null;
};

// First name + last-initial (e.g. "Jane D.") — a lightweight privacy
// nicety per spec §6.2, not a hard requirement; falls back to a generic
// label if the reviewer has no name on file.
function displayName(fullName: string | null): string {
  if (!fullName) return "A renter";
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const lastInitial = parts[parts.length - 1][0];
  return `${first} ${lastInitial}.`;
}

/**
 * Reviews section on the listing detail page (spec §6.2) — heading + list
 * (or empty state), newest first, no pagination/sort control.
 */
export default function ReviewsList({ reviews }: { reviews: ReviewListItem[] }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground">
        {reviews.length > 0 ? `Reviews (${reviews.length})` : "Reviews"}
      </h2>

      {reviews.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          No reviews yet — be the first to rent this and leave one.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {reviews.map((review) => (
            <div
              key={review.id}
              className="rounded-2xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-[#0a0a0a]"
            >
              <div className="flex items-center gap-2">
                <StarRating rating={review.rating} size="sm" />
                <span className="text-sm font-medium text-foreground">
                  {displayName(review.reviewerName)}
                </span>
                <span className="text-zinc-400">·</span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {MONTH_DAY_YEAR.format(new Date(review.createdAt))}
                </span>
              </div>
              {review.comment && (
                <p className="mt-2 whitespace-pre-line text-sm text-foreground">{review.comment}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

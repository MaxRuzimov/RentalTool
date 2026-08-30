import Link from "next/link";
import type { ReactNode } from "react";
import ImagePlaceholder from "@/components/listings/ImagePlaceholder";
import StatusBadge from "./StatusBadge";
import { dayCount, estimatePrice, formatDateRange, formatMoney } from "@/lib/bookings/pricing";

/**
 * One booking row, shared by `/bookings/mine` and `/bookings/owner-requests`
 * (spec §5/§6) — cover thumbnail, listing title, date range, estimated
 * total, status badge. `topLabel` (renter name on the owner view) and
 * `actions`/`contact` slots are what differ per page/section, passed in by
 * the caller rather than duplicating this layout in both places.
 */
export default function BookingListingRow({
  listingId,
  listingTitle,
  coverUrl,
  startDate,
  endDate,
  priceAmount,
  priceUnit,
  status,
  topLabel,
  actions,
  contact,
}: {
  listingId: string;
  listingTitle: string;
  coverUrl: string | null;
  startDate: string;
  endDate: string;
  priceAmount: number;
  priceUnit: string;
  status: string;
  topLabel?: string;
  actions?: ReactNode;
  contact?: ReactNode;
}) {
  const days = dayCount(startDate, endDate);
  const estimate = estimatePrice(priceAmount, priceUnit, days);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-[#0a0a0a] sm:flex-row sm:items-start sm:gap-4">
      <div className="flex gap-4 sm:contents">
        <Link href={`/listings/${listingId}`} className="shrink-0">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverUrl} alt="" className="h-20 w-20 rounded-lg object-cover" />
          ) : (
            <ImagePlaceholder label={listingTitle} className="h-20 w-20 rounded-lg" />
          )}
        </Link>

        <div className="min-w-0 flex-1">
          {topLabel && <p className="text-xs text-zinc-500 dark:text-zinc-400">{topLabel}</p>}
          <Link
            href={`/listings/${listingId}`}
            className="truncate text-sm font-semibold text-foreground hover:underline"
          >
            {listingTitle}
          </Link>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{formatDateRange(startDate, endDate)}</p>

          <p className="mt-1 text-sm text-foreground">
            {estimate.kind === "exact" && (
              <>
                Estimated total: {formatMoney(estimate.total)} for {estimate.days}{" "}
                {estimate.days === 1 ? "day" : "days"}
              </>
            )}
            {estimate.kind === "rounded_weeks" && (
              <>
                Estimated total: {formatMoney(estimate.total)} for {estimate.days}{" "}
                {estimate.days === 1 ? "day" : "days"} — billed as {estimate.weeks}{" "}
                {estimate.weeks === 1 ? "week" : "weeks"}
              </>
            )}
            {estimate.kind === "hourly_no_total" && <>{formatMoney(priceAmount)} / hour</>}
          </p>

          {contact}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 sm:shrink-0 sm:flex-col sm:items-end sm:justify-start">
        <StatusBadge status={status} />
        {actions}
      </div>
    </div>
  );
}

/**
 * Shared date-math + price-estimate formulas for the booking flow (spec
 * docs/design/m5-booking-spec.md §3.3/§11). Used by both the client-side
 * live estimate (RequestToRentForm) and server-rendered booking list rows
 * (/bookings/mine, /bookings/owner-requests) so the two never drift apart —
 * see the M5 task's explicit "don't introduce an off-by-one" warning.
 */

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Inclusive day count: `(end_date - start_date) + 1`. Dates are plain
 * `YYYY-MM-DD` strings (native `<input type="date">` value format) — parsed
 * at UTC midnight on both sides so the subtraction is never off by one due
 * to local-timezone DST shifts.
 */
export function dayCount(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  return Math.round((end - start) / MS_PER_DAY) + 1;
}

export type PriceEstimate =
  | { kind: "exact"; total: number; days: number }
  | { kind: "rounded_weeks"; total: number; days: number; weeks: number }
  | { kind: "hourly_no_total" };

/**
 * Spec §3.3's per-unit formulas, exactly:
 * - day:  price_amount × days
 * - week: price_amount × ceil(days / 7)
 * - hour: no computed total (see §3.3's justification)
 */
export function estimatePrice(priceAmount: number, priceUnit: string, days: number): PriceEstimate {
  if (priceUnit === "week") {
    const weeks = Math.ceil(days / 7);
    return { kind: "rounded_weeks", total: priceAmount * weeks, days, weeks };
  }
  if (priceUnit === "hour") {
    return { kind: "hourly_no_total" };
  }
  // "day" and any unrecognized unit fall back to the exact-day formula.
  return { kind: "exact", total: priceAmount * days, days };
}

export function formatMoney(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/** Today's date as a `YYYY-MM-DD` string, for the date inputs' `min` and
 * for server-side "start date can't be in the past" validation. */
export function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

const MONTH_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const MONTH_DAY_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Human date range for booking rows (spec §5, e.g. "Aug 12 – Aug 16, 2026").
 * Parsed at UTC midnight, same as `dayCount`, so the displayed day never
 * shifts relative to the stored `YYYY-MM-DD` value.
 */
export function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (startDate === endDate) {
    return MONTH_DAY_YEAR.format(start);
  }
  return `${MONTH_DAY.format(start)} – ${MONTH_DAY_YEAR.format(end)}`;
}

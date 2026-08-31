"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { createBookingRequest, type BookingActionState } from "@/app/bookings/actions";
import { dayCount, estimatePrice, formatMoney, todayISODate } from "@/lib/bookings/pricing";

const PRIMARY_BUTTON =
  "flex h-11 w-full items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover active:bg-primary-active disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * The "Request to rent" panel (spec §3.1.A/B, §3.2, §3.3). Renders for both
 * the logged-in-non-owner state (real submit button) and the logged-out
 * state (login link instead of a submit button) — which one is decided by
 * the parent server component via the `loggedIn` prop, per the task's
 * "pass what's needed as props rather than re-deriving auth state inside
 * the client component" instruction. The owner-of-own-listing state (§3.1.C)
 * is a separate, much simpler note rendered directly by the parent — this
 * component is never mounted for that case.
 */
export default function RequestToRentForm({
  listingId,
  priceAmount,
  priceUnit,
  loggedIn,
  loginRedirectTo,
}: {
  listingId: string;
  priceAmount: number;
  priceUnit: string;
  loggedIn: boolean;
  loginRedirectTo: string;
}) {
  // todayISODate() computes the calendar date in a fixed America/Toronto
  // zone (Intl.DateTimeFormat), not the machine's local zone, so this is
  // identical whether it runs during the server render or the client
  // hydration pass — no hydration mismatch.
  const today = useMemo(() => todayISODate(), []);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [submitting, setSubmitting] = useState(false);
  const [state, setState] = useState<BookingActionState>({ status: "idle" });

  function handleStartDateChange(value: string) {
    setStartDate(value);
    // Keep end_date valid as start_date moves forward (spec §3.2: end_date's
    // min tracks the currently-selected start_date).
    if (endDate && endDate < value) {
      setEndDate(value);
    }
  }

  // Exact validation copy from spec §3.2/§11.
  const validationMessage = !startDate
    ? "Please choose a start date."
    : !endDate || endDate < startDate
      ? "End date must be on or after the start date."
      : null;
  const datesValid = validationMessage === null;

  const days = datesValid ? dayCount(startDate, endDate) : 0;
  const estimate = datesValid ? estimatePrice(priceAmount, priceUnit, days) : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!datesValid) return;

    setSubmitting(true);
    setState({ status: "idle" });

    const formData = new FormData();
    formData.set("start_date", startDate);
    formData.set("end_date", endDate);

    const result = await createBookingRequest(listingId, formData);
    // A successful request redirects server-side (throws internally) and
    // never returns a value here — only error states reach this line.
    setSubmitting(false);
    setState(result);
  }

  return (
    <div className="rounded-2xl border border-line p-4">
      <h2 className="text-lg font-semibold text-foreground">Request to rent this tool</h2>

      <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor="start_date" className="text-sm font-medium text-foreground">
              Start date
            </label>
            <input
              id="start_date"
              type="date"
              required
              min={today}
              value={startDate}
              onChange={(e) => handleStartDateChange(e.target.value)}
              className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-zinc-400 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 dark:placeholder:text-zinc-500"
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor="end_date" className="text-sm font-medium text-foreground">
              End date
            </label>
            <input
              id="end_date"
              type="date"
              required
              min={startDate || today}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-zinc-400 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 dark:placeholder:text-zinc-500"
            />
          </div>
        </div>

        {validationMessage && <p className="text-sm text-danger">{validationMessage}</p>}

        {estimate && (
          <div className="flex flex-col gap-0.5 text-sm text-foreground">
            {estimate.kind === "exact" && (
              <>
                <p>
                  Estimated total: <span className="font-semibold">{formatMoney(estimate.total)}</span>{" "}
                  for {estimate.days} {estimate.days === 1 ? "day" : "days"}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  ({formatMoney(priceAmount)} / day)
                </p>
              </>
            )}
            {estimate.kind === "rounded_weeks" && (
              <>
                <p>
                  Estimated total: <span className="font-semibold">{formatMoney(estimate.total)}</span>{" "}
                  for {estimate.days} {estimate.days === 1 ? "day" : "days"} — billed as{" "}
                  {estimate.weeks} {estimate.weeks === 1 ? "week" : "weeks"}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  ({formatMoney(priceAmount)} / week)
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Rounded up to the nearest full week.
                </p>
              </>
            )}
            {estimate.kind === "hourly_no_total" && (
              <p>
                {formatMoney(priceAmount)} / hour — total cost depends on hours used. Confirm the
                total with the owner.
              </p>
            )}
          </div>
        )}

        {state.status === "error" && <p className="text-sm text-danger">{state.message}</p>}

        {loggedIn ? (
          <button type="submit" disabled={submitting || !datesValid} className={`mt-1 ${PRIMARY_BUTTON}`}>
            {submitting ? "Sending request…" : "Request to rent"}
          </button>
        ) : null}
      </form>

      {!loggedIn && (
        <Link
          href={`/login?redirectTo=${encodeURIComponent(loginRedirectTo)}`}
          className={`mt-1 ${PRIMARY_BUTTON}`}
        >
          Log in to request this tool
        </Link>
      )}
    </div>
  );
}

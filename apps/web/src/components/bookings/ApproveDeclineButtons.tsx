"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Spinner from "@/components/ui/Spinner";
import { approveBooking, declineBooking } from "@/app/bookings/actions";

/**
 * Approve/Decline actions on a pending row (spec §6): no confirmation
 * dialog on either (both are easily correctable per spec). The inline error
 * here is what surfaces a checkpoint-2 overlap conflict (spec §4) directly
 * under the affected row, without navigating away or losing the rest of the
 * list.
 */
export default function ApproveDeclineButtons({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"approve" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // M14 fix: both action calls below can throw (e.g. a network failure
  // reaching the Next.js server) — without try/catch that left the button
  // stuck "Approving…"/"Declining…" forever with no feedback.
  async function handleApprove() {
    setPending("approve");
    setError(null);
    try {
      const result = await approveBooking(bookingId);
      if (result.status === "error") {
        setError(result.message ?? "Could not approve this request. Please try again.");
        return;
      }
      router.refresh();
    } catch (err) {
      console.error("ApproveDeclineButtons approve failed", err);
      setError("Could not approve this request. Please try again.");
    } finally {
      setPending(null);
    }
  }

  async function handleDecline() {
    setPending("decline");
    setError(null);
    try {
      const result = await declineBooking(bookingId);
      if (result.status === "error") {
        setError(result.message ?? "Could not decline this request. Please try again.");
        return;
      }
      router.refresh();
    } catch (err) {
      console.error("ApproveDeclineButtons decline failed", err);
      setError("Could not decline this request. Please try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleApprove}
          disabled={pending !== null}
          className="flex h-10 items-center justify-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover active:bg-primary-active disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {pending === "approve" && <Spinner className="mr-2 h-4 w-4" />}
          {pending === "approve" ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          onClick={handleDecline}
          disabled={pending !== null}
          className="flex h-10 items-center justify-center rounded-full border border-solid border-danger/30 px-4 text-sm font-medium text-danger transition-colors hover:bg-danger-bg disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {pending === "decline" && <Spinner className="mr-2 h-4 w-4" />}
          {pending === "decline" ? "Declining…" : "Decline"}
        </button>
      </div>
      {error && <p className="max-w-xs text-right text-xs text-danger">{error}</p>}
    </div>
  );
}

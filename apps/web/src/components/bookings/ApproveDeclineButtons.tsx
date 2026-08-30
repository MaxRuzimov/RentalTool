"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

  async function handleApprove() {
    setPending("approve");
    setError(null);
    const result = await approveBooking(bookingId);
    setPending(null);

    if (result.status === "error") {
      setError(result.message ?? "Could not approve this request. Please try again.");
      return;
    }
    router.refresh();
  }

  async function handleDecline() {
    setPending("decline");
    setError(null);
    const result = await declineBooking(bookingId);
    setPending(null);

    if (result.status === "error") {
      setError(result.message ?? "Could not decline this request. Please try again.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleApprove}
          disabled={pending !== null}
          className="flex h-9 items-center justify-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {pending === "approve" ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          onClick={handleDecline}
          disabled={pending !== null}
          className="flex h-9 items-center justify-center rounded-full border border-solid border-red-600/30 px-4 text-sm font-medium text-red-600 transition-colors hover:bg-red-600/5 disabled:opacity-50"
        >
          {pending === "decline" ? "Declining…" : "Decline"}
        </button>
      </div>
      {error && <p className="max-w-xs text-right text-xs text-red-600">{error}</p>}
    </div>
  );
}

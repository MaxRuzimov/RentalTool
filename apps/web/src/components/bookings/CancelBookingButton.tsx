"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelBooking } from "@/app/bookings/actions";

/**
 * "Cancel request" button (spec §5/§6, exact copy §11) — shared by the
 * renter's `/bookings/mine` and the owner's `/bookings/owner-requests`
 * (an approved booking can be cancelled by either party, spec §1). The
 * server action re-checks who's actually allowed to cancel from the
 * booking's current status; this component just wires up the confirm
 * dialog + inline error + refresh.
 */
export default function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!confirm("Cancel this booking request? This cannot be undone.")) return;

    setPending(true);
    setError(null);

    // M14 fix: the action call itself can throw (e.g. a network failure
    // reaching the Next.js server) — without this try/catch that left the
    // button stuck "Cancelling…" forever with no feedback.
    try {
      const result = await cancelBooking(bookingId);
      if (result.status === "error") {
        setError(result.message ?? "Could not cancel this booking. Please try again.");
        return;
      }
      router.refresh();
    } catch (err) {
      console.error("CancelBookingButton cancel failed", err);
      setError("Could not cancel this booking. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="text-sm font-medium text-danger hover:underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
      >
        {pending ? "Cancelling…" : "Cancel request"}
      </button>
      {error && <p className="mt-1 max-w-xs text-xs text-danger">{error}</p>}
    </div>
  );
}

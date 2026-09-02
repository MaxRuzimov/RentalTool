"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayISODate } from "@/lib/bookings/pricing";

export type BookingActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

// Exact copy strings from spec §11. Not exported — every export from a
// "use server" file must be an async function (see the task's bug-class
// (a) warning), so this stays a module-local const.
const COPY = {
  sessionExpired: "Your session has expired. Please log in again.",
  ownListing: "You can't request to rent your own listing.",
  noStartDate: "Please choose a start date.",
  pastStartDate: "Start date can't be in the past.",
  endBeforeStart: "End date must be on or after the start date.",
  conflictAtRequest:
    "Those dates aren't available — this tool is already booked then. Please choose different dates.",
  conflictAtApproval:
    "Couldn't approve — these dates were just booked by another approved request. Decline this request or ask the renter to choose different dates.",
  noPermission: "You do not have permission to manage this booking.",
};

function parseDates(formData: FormData): { start_date: string; end_date: string } | { error: string } {
  const start_date = String(formData.get("start_date") ?? "").trim();
  const end_date = String(formData.get("end_date") ?? "").trim();

  if (!start_date) {
    return { error: COPY.noStartDate };
  }
  if (start_date < todayISODate()) {
    return { error: COPY.pastStartDate };
  }
  if (!end_date || end_date < start_date) {
    return { error: COPY.endBeforeStart };
  }
  return { start_date, end_date };
}

/**
 * Creates a new booking request (spec §3.4). `renter_id` is always taken
 * from the authenticated session, never client input — same convention as
 * `listings.owner_id` in createListing.
 *
 * M14 fix: wrapped in try/catch as a backstop for unexpected failures (e.g.
 * a network error/timeout reaching Supabase) that aren't already surfaced as
 * a checked `{ data, error }` result below. `redirect()` on success
 * deliberately stays OUTSIDE the try block — see createListing's comment in
 * listings/actions.ts for why a blanket catch there would break it.
 */
export async function createBookingRequest(
  listingId: string,
  formData: FormData,
): Promise<BookingActionState> {
  const supabase = await createClient();

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { status: "error", message: COPY.sessionExpired };
    }

    const { data: listing } = await supabase
      .from("listings")
      .select("id, owner_id")
      .eq("id", listingId)
      .maybeSingle();

    if (!listing) {
      return { status: "error", message: "This listing is no longer available." };
    }

    // Defense-in-depth backstop for spec §3.1.C — the form shouldn't even be
    // reachable for an owner viewing their own listing, but a hand-built
    // request must still be rejected server-side.
    if (listing.owner_id === user.id) {
      return { status: "error", message: COPY.ownListing };
    }

    const parsed = parseDates(formData);
    if ("error" in parsed) {
      return { status: "error", message: parsed.error };
    }

    // Checkpoint 1 (spec §4). Runs — and must fully resolve — before the
    // INSERT below, so a request that fails the overlap check never partially
    // commits a row first (bug class explicitly called out for this task).
    const { data: hasConflict, error: overlapError } = await supabase.rpc(
      "booking_has_approved_overlap",
      {
        p_listing_id: listingId,
        p_start_date: parsed.start_date,
        p_end_date: parsed.end_date,
      },
    );

    if (overlapError) {
      console.error(overlapError);
      return { status: "error", message: "Could not check availability. Please try again." };
    }

    if (hasConflict) {
      return { status: "error", message: COPY.conflictAtRequest };
    }

    const { error } = await supabase.from("bookings").insert({
      listing_id: listingId,
      renter_id: user.id,
      start_date: parsed.start_date,
      end_date: parsed.end_date,
      status: "pending",
    });

    if (error) {
      console.error(error);
      return { status: "error", message: "Could not send your request. Please try again." };
    }
  } catch (err) {
    console.error("createBookingRequest: unexpected error", err);
    return { status: "error", message: "Could not send your request. Please try again." };
  }

  redirect("/bookings/mine?requestSent=1");
}

/**
 * Cancels a booking (spec §1's transition table): the renter can cancel a
 * `pending` or `approved` booking of theirs; the listing owner can only
 * cancel an `approved` booking. Any other attempt is rejected.
 *
 * M14 fix: wrapped in try/catch as a backstop for unexpected failures (e.g.
 * a network error/timeout reaching Supabase) that aren't already surfaced as
 * a checked `{ data, error }` result below — without it, such a failure
 * would throw all the way out of this Server Action with no friendly
 * message, and for a caller using a plain `await` (not `useActionState`,
 * which every caller of this action is — see CancelBookingButton) that
 * leaves the button stuck "Cancelling…" forever with no feedback.
 */
export async function cancelBooking(bookingId: string): Promise<BookingActionState> {
  const supabase = await createClient();

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { status: "error", message: COPY.sessionExpired };
    }

    const { data: booking } = await supabase
      .from("bookings")
      .select("id, status, renter_id, listing_id, end_date")
      .eq("id", bookingId)
      .maybeSingle();

    if (!booking) {
      return { status: "error", message: COPY.noPermission };
    }

    const isRenter = booking.renter_id === user.id;
    let isOwner = false;
    if (!isRenter) {
      const { data: listing } = await supabase
        .from("listings")
        .select("owner_id")
        .eq("id", booking.listing_id)
        .maybeSingle();
      isOwner = listing?.owner_id === user.id;
    }

    if (!isRenter && !isOwner) {
      return { status: "error", message: COPY.noPermission };
    }

    // M14 fix: this is the real authorization boundary (the UI's "Cancel
    // request" button is UX only — same convention as every other action in
    // this file), so the "an already-ended approved booking can't be
    // cancelled" rule has to live here too, not just in the two pages that
    // render the button. Without this, a hand-built request could still
    // cancel a completed rental even after the button was hidden — which
    // would also silently break review eligibility, since createReview and
    // /bookings/mine's review slot both require `status = 'approved'`.
    const allowed =
      (booking.status === "pending" && isRenter) ||
      (booking.status === "approved" && (isRenter || isOwner) && booking.end_date >= todayISODate());

    if (!allowed) {
      return { status: "error", message: "This booking can no longer be cancelled." };
    }

    const { error } = await supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", bookingId);

    if (error) {
      console.error(error);
      return { status: "error", message: "Could not cancel this booking. Please try again." };
    }

    revalidatePath("/bookings/mine");
    revalidatePath("/bookings/owner-requests");
    return { status: "success" };
  } catch (err) {
    console.error("cancelBooking: unexpected error", err);
    return { status: "error", message: "Could not cancel this booking. Please try again." };
  }
}

/**
 * Approves a pending request (owner-only). Re-checks ownership server-side
 * (RLS is the real boundary; this is what lets us return a friendly error
 * instead of a silent no-op, same convention as updateListing) and re-runs
 * the availability check (checkpoint 2, spec §4) BEFORE the UPDATE — if a
 * conflict is found the booking stays `pending` (not auto-declined).
 *
 * M14 fix: wrapped in try/catch — same rationale as cancelBooking above.
 */
export async function approveBooking(bookingId: string): Promise<BookingActionState> {
  const supabase = await createClient();

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { status: "error", message: COPY.sessionExpired };
    }

    const { data: booking } = await supabase
      .from("bookings")
      .select("id, status, listing_id, start_date, end_date")
      .eq("id", bookingId)
      .maybeSingle();

    if (!booking) {
      return { status: "error", message: COPY.noPermission };
    }

    const { data: listing } = await supabase
      .from("listings")
      .select("owner_id")
      .eq("id", booking.listing_id)
      .maybeSingle();

    if (!listing || listing.owner_id !== user.id) {
      return { status: "error", message: COPY.noPermission };
    }

    if (booking.status !== "pending") {
      return { status: "error", message: "This request can no longer be approved." };
    }

    // Checkpoint 2 (spec §4) — the real safety net. Must run, and be checked,
    // before the UPDATE below: two pending requests can overlap each other
    // (checkpoint 1 never blocks pending-vs-pending), so this re-check against
    // what's now actually `approved` is what prevents a double-booking here.
    const { data: hasConflict, error: overlapError } = await supabase.rpc(
      "booking_has_approved_overlap",
      {
        p_listing_id: booking.listing_id,
        p_start_date: booking.start_date,
        p_end_date: booking.end_date,
        p_exclude_booking_id: booking.id,
      },
    );

    if (overlapError) {
      console.error(overlapError);
      return { status: "error", message: "Could not check availability. Please try again." };
    }

    if (hasConflict) {
      // Left `pending`, not auto-declined, per spec §4.
      return { status: "error", message: COPY.conflictAtApproval };
    }

    const { error } = await supabase
      .from("bookings")
      .update({ status: "approved" })
      .eq("id", bookingId);

    if (error) {
      console.error(error);
      return { status: "error", message: "Could not approve this request. Please try again." };
    }

    revalidatePath("/bookings/owner-requests");
    revalidatePath("/bookings/mine");
    return { status: "success" };
  } catch (err) {
    console.error("approveBooking: unexpected error", err);
    return { status: "error", message: "Could not approve this request. Please try again." };
  }
}

/**
 * Declines a pending request (owner-only). `pending` -> `declined` only —
 * spec §1: decline is not a valid transition from any other status.
 *
 * M14 fix: wrapped in try/catch — same rationale as cancelBooking above.
 */
export async function declineBooking(bookingId: string): Promise<BookingActionState> {
  const supabase = await createClient();

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { status: "error", message: COPY.sessionExpired };
    }

    const { data: booking } = await supabase
      .from("bookings")
      .select("id, status, listing_id")
      .eq("id", bookingId)
      .maybeSingle();

    if (!booking) {
      return { status: "error", message: COPY.noPermission };
    }

    const { data: listing } = await supabase
      .from("listings")
      .select("owner_id")
      .eq("id", booking.listing_id)
      .maybeSingle();

    if (!listing || listing.owner_id !== user.id) {
      return { status: "error", message: COPY.noPermission };
    }

    if (booking.status !== "pending") {
      return { status: "error", message: "This request can no longer be declined." };
    }

    const { error } = await supabase
      .from("bookings")
      .update({ status: "declined" })
      .eq("id", bookingId);

    if (error) {
      console.error(error);
      return { status: "error", message: "Could not decline this request. Please try again." };
    }

    revalidatePath("/bookings/owner-requests");
    revalidatePath("/bookings/mine");
    return { status: "success" };
  } catch (err) {
    console.error("declineBooking: unexpected error", err);
    return { status: "error", message: "Could not decline this request. Please try again." };
  }
}

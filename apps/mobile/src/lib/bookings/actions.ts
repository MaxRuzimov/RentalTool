/**
 * Booking mutations (create/cancel/approve/decline) — a direct port of
 * `apps/web/src/app/bookings/actions.ts`'s logic and exact copy (spec §11),
 * adapted to run on-device against the RN Supabase client instead of inside
 * a Next.js server action. RLS + the `bookings_enforce_transition` trigger
 * remain the real enforcement boundary (same as they already are for any
 * other API caller, including a hand-built request) — the pre-checks below
 * exist purely to surface the same friendly, specific copy web shows,
 * mirroring web's defense-in-depth checks rather than re-deriving new
 * validation logic.
 */
import { supabase } from "@/lib/supabase/client";
import { todayISODate } from "@/lib/bookings/pricing";

export type BookingActionState = { status: "success" } | { status: "error"; message: string };

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

function parseDates(
  startDate: string,
  endDate: string,
): { start_date: string; end_date: string } | { error: string } {
  const start_date = startDate.trim();
  const end_date = endDate.trim();

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

export async function createBookingRequest(
  listingId: string,
  startDate: string,
  endDate: string,
): Promise<BookingActionState> {
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

  if (listing.owner_id === user.id) {
    return { status: "error", message: COPY.ownListing };
  }

  const parsed = parseDates(startDate, endDate);
  if ("error" in parsed) {
    return { status: "error", message: parsed.error };
  }

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

  return { status: "success" };
}

export async function cancelBooking(bookingId: string): Promise<BookingActionState> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: COPY.sessionExpired };
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, status, renter_id, listing_id")
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

  const allowed =
    (booking.status === "pending" && isRenter) ||
    (booking.status === "approved" && (isRenter || isOwner));

  if (!allowed) {
    return { status: "error", message: "This booking can no longer be cancelled." };
  }

  const { error } = await supabase.from("bookings").update({ status: "cancelled" }).eq("id", bookingId);

  if (error) {
    console.error(error);
    return { status: "error", message: "Could not cancel this booking. Please try again." };
  }

  return { status: "success" };
}

export async function approveBooking(bookingId: string): Promise<BookingActionState> {
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
    return { status: "error", message: COPY.conflictAtApproval };
  }

  const { error } = await supabase.from("bookings").update({ status: "approved" }).eq("id", bookingId);

  if (error) {
    console.error(error);
    return { status: "error", message: "Could not approve this request. Please try again." };
  }

  return { status: "success" };
}

export async function declineBooking(bookingId: string): Promise<BookingActionState> {
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

  const { error } = await supabase.from("bookings").update({ status: "declined" }).eq("id", bookingId);

  if (error) {
    console.error(error);
    return { status: "error", message: "Could not decline this request. Please try again." };
  }

  return { status: "success" };
}

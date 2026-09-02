import Link from "next/link";
import { Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signImageUrls } from "@/lib/listings/storage";
import BookingListingRow from "@/components/bookings/BookingListingRow";
import CancelBookingButton from "@/components/bookings/CancelBookingButton";
import ApproveDeclineButtons from "@/components/bookings/ApproveDeclineButtons";
import ContactInfo from "@/components/bookings/ContactInfo";
import EmptyState from "@/components/ui/EmptyState";

type BookingRow = {
  id: string;
  listing_id: string;
  renter_id: string;
  start_date: string;
  end_date: string;
  status: string;
  listings: { title: string; price_amount: number; price_unit: string; owner_id: string } | null;
};

// Route protection (spec §6): server-side redirect, same pattern as
// /bookings/mine and /listings/mine.
export default async function OwnerRequestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/bookings/owner-requests");
  }

  // `listings!inner` + filtering on the embedded column restricts this to
  // bookings on listings this user owns — without it, RLS's OR'd
  // select policies would also let through bookings where this user is
  // merely the *renter* on someone else's listing, which don't belong on
  // this page.
  const { data: bookingsData } = await supabase
    .from("bookings")
    .select(
      "id, listing_id, renter_id, start_date, end_date, status, listings!inner(title, price_amount, price_unit, owner_id)",
    )
    .eq("listings.owner_id", user.id)
    .order("created_at", { ascending: false });

  const bookings = (bookingsData ?? []) as unknown as BookingRow[];

  const listingIds = [...new Set(bookings.map((b) => b.listing_id))];
  const { data: covers } =
    listingIds.length > 0
      ? await supabase
          .from("listing_images")
          .select("listing_id, storage_path")
          .in("listing_id", listingIds)
          .eq("position", 0)
      : { data: [] as { listing_id: string; storage_path: string }[] };

  const urlByPath = await signImageUrls(
    supabase,
    (covers ?? []).map((c) => c.storage_path),
  );
  const coverByListingId = new Map(
    (covers ?? []).map((c) => [c.listing_id, urlByPath.get(c.storage_path) ?? null]),
  );

  const renterIds = [...new Set(bookings.map((b) => b.renter_id))];
  const { data: renterProfiles } =
    renterIds.length > 0
      ? await supabase.from("public_profiles").select("id, full_name").in("id", renterIds)
      : { data: [] as { id: string; full_name: string | null }[] };
  const renterNameById = new Map((renterProfiles ?? []).map((p) => [p.id, p.full_name]));

  // Phone visibility (spec §3.5): only fetched for approved bookings, via
  // the booking-scoped booking_contact() RPC.
  const approvedIds = bookings.filter((b) => b.status === "approved").map((b) => b.id);
  const contactByBookingId = new Map<string, { full_name: string | null; phone: string | null }>();
  await Promise.all(
    approvedIds.map(async (id) => {
      const { data } = await supabase.rpc("booking_contact", { booking_id: id });
      const row = data?.[0];
      if (row) contactByBookingId.set(id, row);
    }),
  );

  const pending = bookings.filter((b) => b.status === "pending");
  const history = bookings.filter((b) => b.status !== "pending");

  function renderRow(booking: BookingRow, section: "pending" | "history") {
    const listing = booking.listings;
    if (!listing) return null;

    const topLabel = renterNameById.get(booking.renter_id) || "A renter";
    const contact = contactByBookingId.get(booking.id);

    let actions: ReactNode;
    if (section === "pending") {
      actions = <ApproveDeclineButtons bookingId={booking.id} />;
    } else if (booking.status === "approved") {
      actions = <CancelBookingButton bookingId={booking.id} />;
    }

    return (
      <BookingListingRow
        key={booking.id}
        listingId={booking.listing_id}
        listingTitle={listing.title}
        coverUrl={coverByListingId.get(booking.listing_id) ?? null}
        startDate={booking.start_date}
        endDate={booking.end_date}
        priceAmount={listing.price_amount}
        priceUnit={listing.price_unit}
        status={booking.status}
        topLabel={topLabel}
        actions={actions}
        contact={
          booking.status === "approved" ? (
            <ContactInfo fullName={contact?.full_name ?? null} phone={contact?.phone ?? null} />
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Requests to me</h1>

      <div className="mt-3 text-sm font-medium">
        <Link
          href="/bookings/mine"
          className="text-accent underline-offset-2 hover:underline hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
        >
          My requests
        </Link>
        <span className="mx-2 text-zinc-400">·</span>
        <span className="font-bold text-foreground">Requests to me</span>
      </div>

      {bookings.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={Inbox}
            title="No booking requests yet."
            description="Requests to rent your listings will show up here."
          />
        </div>
      ) : (
        <>
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-foreground">Pending requests</h2>
            {pending.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">No pending requests.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                {pending.map((b) => renderRow(b, "pending"))}
              </div>
            )}
          </section>

          <section className="mt-10">
            <h2 className="text-lg font-semibold text-foreground">History</h2>
            {history.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">No past requests yet.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                {history.map((b) => renderRow(b, "history"))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

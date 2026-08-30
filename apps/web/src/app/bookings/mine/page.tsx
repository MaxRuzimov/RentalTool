import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signImageUrls } from "@/lib/listings/storage";
import BookingListingRow from "@/components/bookings/BookingListingRow";
import CancelBookingButton from "@/components/bookings/CancelBookingButton";
import ContactInfo from "@/components/bookings/ContactInfo";

const BROWSE_BUTTON =
  "flex h-10 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]";

type BookingRow = {
  id: string;
  listing_id: string;
  start_date: string;
  end_date: string;
  status: string;
  listings: { title: string; price_amount: number; price_unit: string } | null;
};

// Route protection (spec §5): server-side redirect, same pattern as
// /listings/mine and /profile.
export default async function MyBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ requestSent?: string }>;
}) {
  const { requestSent } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/bookings/mine");
  }

  const { data: bookingsData } = await supabase
    .from("bookings")
    .select("id, listing_id, start_date, end_date, status, listings(title, price_amount, price_unit)")
    .eq("renter_id", user.id)
    .order("created_at", { ascending: false });

  const bookings = (bookingsData ?? []) as unknown as BookingRow[];

  const listingIds = bookings.map((b) => b.listing_id);
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

  // Phone visibility (spec §3.5): only fetched for approved bookings, via
  // the booking-scoped booking_contact() RPC — not a general profile query.
  const approvedIds = bookings.filter((b) => b.status === "approved").map((b) => b.id);
  const contactByBookingId = new Map<string, { full_name: string | null; phone: string | null }>();
  await Promise.all(
    approvedIds.map(async (id) => {
      const { data } = await supabase.rpc("booking_contact", { booking_id: id });
      const row = data?.[0];
      if (row) contactByBookingId.set(id, row);
    }),
  );

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
      <h1 className="text-2xl font-semibold text-foreground">My bookings</h1>

      <div className="mt-3 text-sm font-medium">
        <span className="font-bold text-foreground">My requests</span>
        <span className="mx-2 text-zinc-400">·</span>
        <Link href="/bookings/owner-requests" className="text-foreground underline">
          Requests to me
        </Link>
      </div>

      {requestSent && (
        <p className="mt-6 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-600 dark:bg-green-900/20">
          Request sent! The owner will respond soon.
        </p>
      )}

      {bookings.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-4 rounded-2xl border border-black/[.08] py-16 text-center dark:border-white/[.145]">
          <p className="text-foreground">You haven&apos;t requested to rent anything yet.</p>
          <Link href="/listings" className={BROWSE_BUTTON}>
            Browse listings
          </Link>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-3">
          {bookings.map((booking) => {
            const listing = booking.listings;
            if (!listing) return null;
            const canCancel = booking.status === "pending" || booking.status === "approved";
            const contact = contactByBookingId.get(booking.id);

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
                actions={canCancel ? <CancelBookingButton bookingId={booking.id} /> : undefined}
                contact={
                  booking.status === "approved" ? (
                    <ContactInfo fullName={contact?.full_name ?? null} phone={contact?.phone ?? null} />
                  ) : undefined
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

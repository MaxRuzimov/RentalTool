import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signImageUrls } from "@/lib/listings/storage";
import MyListingCard from "@/components/listings/MyListingCard";
import type { ListingCardData } from "@/components/listings/ListingCard";

const NEW_LISTING_BUTTON =
  "flex h-10 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]";

// Route protection (spec §6): server-side check, same pattern as /profile.
export default async function MyListingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/listings/mine");
  }

  const { data: listings } = await supabase
    .from("listings")
    .select("id, title, category, price_amount, price_unit, location")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  const listingIds = (listings ?? []).map((l) => l.id);
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

  const cards: ListingCardData[] = (listings ?? []).map((l) => ({
    ...l,
    coverUrl: coverByListingId.get(l.id) ?? null,
  }));

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">My listings</h1>
        <Link href="/listings/new" className={NEW_LISTING_BUTTON}>
          + New listing
        </Link>
      </div>

      {cards.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-black/[.08] py-16 text-center dark:border-white/[.145]">
          <p className="text-foreground">You haven&apos;t listed any tools yet.</p>
          <Link href="/listings/new" className={NEW_LISTING_BUTTON}>
            + New listing
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {cards.map((listing) => (
            <MyListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signImageUrls } from "@/lib/listings/storage";
import ListingCard from "@/components/listings/ListingCard";
import type { ListingCardData } from "@/components/listings/ListingCard";

// No pagination UI required for MVP (spec §5.4) — a hard cap on the most
// recent rows is an acceptable simplification.
const INDEX_LIMIT = 60;

export default async function ListingsIndexPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // `status = 'published'` is always true per §1's "no draft workflow"
  // decision, but the filter is written explicitly so it's a no-op-safe
  // query rather than a behavior engineers need to remember to add later.
  const { data: listings } = await supabase
    .from("listings")
    .select("id, title, category, price_amount, price_unit, location")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(INDEX_LIMIT);

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
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-12">
      <h1 className="mb-8 text-2xl font-semibold text-foreground">Browse listings</h1>

      {cards.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-black/[.08] py-16 text-center dark:border-white/[.145]">
          <p className="text-foreground">No listings yet.</p>
          <Link
            href={user ? "/listings/new" : "/signup"}
            className="text-sm font-medium text-foreground underline"
          >
            Be the first to list a tool!
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
    </div>
  );
}

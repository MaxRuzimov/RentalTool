import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signImageUrls } from "@/lib/listings/storage";
import ListingForm from "@/components/listings/ListingForm";

// Route protection (spec §6): auth required, owner only. Ownership check
// happens after the auth check, per spec §5.2 — non-owners are redirected
// to the public detail view rather than shown a forbidden page. RLS's
// owner-only update/delete policies (see the M3 migration) are the actual
// security boundary; this redirect only keeps the UX from showing a form
// whose submit would just fail.
export default async function EditListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirectTo=/listings/${id}/edit`);
  }

  const { data: listing } = await supabase
    .from("listings")
    .select("id, owner_id, title, description, category, price_amount, price_unit, location")
    .eq("id", id)
    .maybeSingle();

  if (!listing) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
        <p className="text-lg text-foreground">Listing not found</p>
        <Link href="/listings" className="text-sm font-medium text-foreground underline">
          Back to listings
        </Link>
      </div>
    );
  }

  if (listing.owner_id !== user.id) {
    redirect(`/listings/${id}`);
  }

  const { data: images } = await supabase
    .from("listing_images")
    .select("id, storage_path")
    .eq("listing_id", id)
    .order("position", { ascending: true });

  const urlByPath = await signImageUrls(
    supabase,
    (images ?? []).map((img) => img.storage_path),
  );

  const initialImages = (images ?? [])
    .map((img) => ({ id: img.id, url: urlByPath.get(img.storage_path) ?? "" }))
    .filter((img) => img.url);

  return (
    <ListingForm
      mode="edit"
      listingId={listing.id}
      initial={{
        title: listing.title,
        description: listing.description,
        category: listing.category,
        price_amount: String(listing.price_amount),
        price_unit: listing.price_unit,
        location: listing.location,
      }}
      initialImages={initialImages}
    />
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signImageUrls } from "@/lib/listings/storage";
import { categoryLabel, formatPrice } from "@/lib/listings/categories";
import ImagePlaceholder from "@/components/listings/ImagePlaceholder";
import OwnerAvatar from "@/components/listings/OwnerAvatar";
import RequestToRentForm from "@/components/bookings/RequestToRentForm";

// Public page (spec §5.5): RLS's "Anyone can view published listings" policy
// (plus the owner-only policy, for the owner's own view) is what actually
// authorizes this select — a listing that doesn't exist or isn't published
// (and isn't the viewer's own) simply comes back null here, which maps to a
// real 404 via notFound().
export default async function ListingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ photoError?: string }>;
}) {
  const { id } = await params;
  const { photoError } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: listing } = await supabase
    .from("listings")
    .select("id, owner_id, title, description, category, price_amount, price_unit, location")
    .eq("id", id)
    .maybeSingle();

  if (!listing) {
    notFound();
  }

  const { data: images } = await supabase
    .from("listing_images")
    .select("storage_path")
    .eq("listing_id", id)
    .order("position", { ascending: true });

  const urlByPath = await signImageUrls(
    supabase,
    (images ?? []).map((img) => img.storage_path),
  );
  const photoUrls = (images ?? [])
    .map((img) => urlByPath.get(img.storage_path))
    .filter((url): url is string => Boolean(url));

  const { data: owner } = await supabase
    .from("public_profiles")
    .select("full_name, avatar_url, city")
    .eq("id", listing.owner_id)
    .maybeSingle();

  const isOwner = user?.id === listing.owner_id;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
      {photoError && (
        <p className="mb-4 text-sm text-red-600">
          Listing saved, but one or more photos failed to upload. You can add photos from the
          edit page.
        </p>
      )}

      {photoUrls.length > 0 ? (
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoUrls[0]}
            alt=""
            className="aspect-video w-full rounded-2xl object-cover"
          />
          {photoUrls.length > 1 && (
            <div className="mt-2 flex gap-2 overflow-x-auto">
              {photoUrls.slice(1).map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={url}
                  src={url}
                  alt=""
                  className="h-20 w-20 shrink-0 rounded-lg object-cover"
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <ImagePlaceholder label={listing.title} className="aspect-video w-full rounded-2xl" />
      )}

      <div className="mt-6 flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold text-foreground">{listing.title}</h1>
        {isOwner && (
          <Link
            href={`/listings/${listing.id}/edit`}
            className="shrink-0 text-sm font-medium text-foreground underline"
          >
            Edit listing
          </Link>
        )}
      </div>

      <p className="mt-1 text-lg font-medium text-foreground">
        {formatPrice(listing.price_amount, listing.price_unit)}
      </p>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        {categoryLabel(listing.category)} · {listing.location}
      </p>

      <p className="mt-6 whitespace-pre-line text-sm text-foreground">{listing.description}</p>

      <div className="mt-8 flex items-center gap-3 border-t border-black/[.08] pt-6 dark:border-white/[.145]">
        {owner?.avatar_url ? <OwnerAvatar url={owner.avatar_url} /> : null}
        <div>
          <p className="text-sm font-medium text-foreground">
            {owner?.full_name || "A tool owner on RentalTool"}
          </p>
          {owner?.city && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{owner.city}</p>
          )}
        </div>
      </div>

      <div className="mt-6">
        {isOwner ? (
          // Spec §3.1.C: an owner requesting their own tool is meaningless
          // (and the server action rejects it anyway as a backstop) — a
          // small note in the same vertical slot, with a link to where
          // they'd actually manage requests on this listing.
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            This is your listing.{" "}
            <Link href="/bookings/owner-requests" className="font-medium text-foreground underline">
              View requests
            </Link>
          </p>
        ) : (
          <RequestToRentForm
            listingId={listing.id}
            priceAmount={listing.price_amount}
            priceUnit={listing.price_unit}
            loggedIn={Boolean(user)}
            loginRedirectTo={`/listings/${listing.id}`}
          />
        )}
      </div>
    </div>
  );
}

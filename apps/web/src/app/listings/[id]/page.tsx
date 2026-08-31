import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signImageUrls } from "@/lib/listings/storage";
import { categoryLabel, formatPrice } from "@/lib/listings/categories";
import ImagePlaceholder from "@/components/listings/ImagePlaceholder";
import OwnerAvatar from "@/components/listings/OwnerAvatar";
import RequestToRentForm from "@/components/bookings/RequestToRentForm";
import StarRating from "@/components/reviews/StarRating";
import ReviewsList, { type ReviewListItem } from "@/components/reviews/ReviewsList";

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

  // Reviews (spec §6): one query for the ordered list, joined to
  // public_profiles for the reviewer's display name (same view used for the
  // owner block above — no new profile-visibility surface); the aggregate
  // average/count is derived client-side from that same result set rather
  // than a second round trip, since M6 has no pagination (spec §6.2) so the
  // full list is already in hand.
  const { data: reviewRows } = await supabase
    .from("reviews")
    .select("id, rating, comment, created_at, renter_id")
    .eq("listing_id", id)
    .order("created_at", { ascending: false });

  const reviewerIds = [...new Set((reviewRows ?? []).map((r) => r.renter_id))];
  const { data: reviewers } =
    reviewerIds.length > 0
      ? await supabase.from("public_profiles").select("id, full_name").in("id", reviewerIds)
      : { data: [] as { id: string; full_name: string | null }[] };
  const nameByReviewerId = new Map((reviewers ?? []).map((r) => [r.id, r.full_name]));

  const reviews: ReviewListItem[] = (reviewRows ?? []).map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.created_at,
    reviewerName: nameByReviewerId.get(r.renter_id) ?? null,
  }));

  const reviewCount = reviews.length;
  const averageRating =
    reviewCount > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount : 0;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
      {photoError && (
        <p className="mb-4 text-sm text-danger">
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
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{listing.title}</h1>
        {isOwner && (
          <Link
            href={`/listings/${listing.id}/edit`}
            className="shrink-0 text-sm font-medium text-accent underline-offset-2 hover:underline hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
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

      {reviewCount > 0 ? (
        <div className="mt-1 flex items-center gap-1.5">
          <StarRating rating={averageRating} size="sm" />
          <span className="text-sm text-foreground">
            {averageRating.toFixed(1)} ({reviewCount} review{reviewCount === 1 ? "" : "s"})
          </span>
        </div>
      ) : (
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">No reviews yet</p>
      )}

      <p className="mt-6 whitespace-pre-line text-sm text-foreground">{listing.description}</p>

      <div className="mt-8 flex items-center gap-3 border-t border-line-strong pt-6">
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
            <Link
              href="/bookings/owner-requests"
              className="font-medium text-accent underline-offset-2 hover:underline hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
            >
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

      <div className="mt-10 border-t border-line-strong pt-6">
        <ReviewsList reviews={reviews} />
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { categoryLabel, formatPrice } from "@/lib/listings/categories";
import { deleteListing } from "@/app/listings/actions";
import ImagePlaceholder from "./ImagePlaceholder";
import type { ListingCardData } from "./ListingCard";

/** Row used on `/listings/mine` (spec §5.3): cover, details, Edit + Delete. */
export default function MyListingCard({ listing }: { listing: ListingCardData }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm("Delete this listing? This cannot be undone.")) return;
    setDeleting(true);
    setError(null);

    const result = await deleteListing(listing.id);
    setDeleting(false);
    if (result.status === "error") {
      setError(result.message ?? "Could not delete this listing. Please try again.");
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-[#0a0a0a] sm:flex-row sm:items-center sm:gap-4">
      <div className="flex gap-4 sm:contents">
        <Link href={`/listings/${listing.id}`} className="shrink-0">
          {listing.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={listing.coverUrl}
              alt=""
              className="h-20 w-20 rounded-lg object-cover"
            />
          ) : (
            <ImagePlaceholder label={listing.title} className="h-20 w-20 rounded-lg" />
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <Link href={`/listings/${listing.id}`} className="truncate text-sm font-semibold text-foreground hover:underline">
            {listing.title}
          </Link>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">{categoryLabel(listing.category)}</p>
          <p className="text-sm text-foreground">
            {formatPrice(listing.price_amount, listing.price_unit)}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{listing.location}</p>
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-sm font-medium sm:shrink-0 sm:flex-col sm:items-end sm:justify-start">
        <Link href={`/listings/${listing.id}/edit`} className="text-foreground hover:underline">
          Edit
        </Link>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="text-red-600 hover:underline disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  );
}

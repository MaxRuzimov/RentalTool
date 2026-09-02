import Link from "next/link";
import { categoryLabel, formatPrice } from "@/lib/listings/categories";
import ImagePlaceholder from "./ImagePlaceholder";

export type ListingCardData = {
  id: string;
  title: string;
  category: string;
  price_amount: number;
  price_unit: string;
  location: string;
  coverUrl: string | null;
};

/** Public card used on `/listings` (spec §5.4) — whole card links to detail. */
export default function ListingCard({ listing }: { listing: ListingCardData }) {
  return (
    <Link
      href={`/listings/${listing.id}`}
      className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {listing.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={listing.coverUrl} alt="" className="aspect-square w-full object-cover" />
      ) : (
        <ImagePlaceholder className="aspect-square w-full" />
      )}
      <div className="flex flex-col gap-1 p-4">
        <h3 className="truncate text-sm font-semibold text-foreground">{listing.title}</h3>
        <p className="text-sm font-semibold text-foreground">
          {formatPrice(listing.price_amount, listing.price_unit)}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{listing.location}</p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          {categoryLabel(listing.category)}
        </p>
      </div>
    </Link>
  );
}

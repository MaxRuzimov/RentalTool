import Link from "next/link";

// Real Next.js not-found segment (spec §5.5) — returns a proper 404 for
// `/listings/[id]` when the row doesn't exist (or isn't visible to this
// viewer per RLS), rather than a client-side conditional render.
export default function ListingNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <p className="text-lg text-foreground">Listing not found</p>
      <Link
        href="/listings"
        className="text-sm font-medium text-accent underline-offset-2 hover:underline hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
      >
        Back to listings
      </Link>
    </div>
  );
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signImageUrls } from "@/lib/listings/storage";
import ListingCard from "@/components/listings/ListingCard";
import type { ListingCardData } from "@/components/listings/ListingCard";
import {
  LISTING_CATEGORIES,
  PRICE_UNITS,
  type ListingCategory,
  type PriceUnit,
} from "@/lib/listings/categories";

// No pagination UI required for MVP (spec §5.4) — a hard cap on the most
// recent rows is an acceptable simplification.
const INDEX_LIMIT = 60;

type SearchParams = {
  category?: string;
  location?: string;
  price_min?: string;
  price_max?: string;
  price_unit?: string;
};

function isValidCategory(value: string | undefined): value is ListingCategory {
  return LISTING_CATEGORIES.some((c) => c.value === value);
}

function isValidPriceUnit(value: string | undefined): value is PriceUnit {
  return PRICE_UNITS.some((u) => u.value === value);
}

/** Absent, empty, non-numeric, or negative input parses to `undefined` (M4 spec §3/§4). */
function parseValidPrice(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) return undefined;
  return n;
}

const inputClassName =
  "w-full rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm text-foreground dark:border-white/[.145]";

export default async function ListingsIndexPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const category = isValidCategory(params.category) ? params.category : undefined;
  const trimmedLocation = params.location?.trim();
  let min = parseValidPrice(params.price_min);
  let max = parseValidPrice(params.price_max);
  if (min !== undefined && max !== undefined && min > max) {
    [min, max] = [max, min];
  }
  const priceUnit =
    min !== undefined || max !== undefined
      ? isValidPriceUnit(params.price_unit)
        ? params.price_unit
        : "day"
      : undefined;

  // "Active filter" per M4 spec §8/§9 — a lone `price_unit` with no
  // price_min/price_max does not count, since it has no effect on the query.
  const hasActiveFilter =
    category !== undefined || Boolean(trimmedLocation) || min !== undefined || max !== undefined;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // `status = 'published'` is always true per §1's "no draft workflow"
  // decision, but the filter is written explicitly so it's a no-op-safe
  // query rather than a behavior engineers need to remember to add later.
  let query = supabase
    .from("listings")
    .select("id, title, category, price_amount, price_unit, location")
    .eq("status", "published");

  if (category) {
    query = query.eq("category", category);
  }

  if (trimmedLocation) {
    query = query.ilike("location", `%${trimmedLocation}%`);
  }

  if (priceUnit) {
    query = query.eq("price_unit", priceUnit);
    if (min !== undefined) query = query.gte("price_amount", min);
    if (max !== undefined) query = query.lte("price_amount", max);
  }

  const { data: listings } = await query
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

      <form
        method="GET"
        action="/listings"
        className="mb-6 flex flex-col gap-3 rounded-2xl border border-black/[.08] p-4 dark:border-white/[.145] sm:flex-row sm:flex-wrap sm:items-end sm:gap-3"
      >
        <label className="flex w-full flex-col gap-1 text-sm sm:w-40">
          <span className="font-medium text-foreground">Category</span>
          <select
            name="category"
            defaultValue={category ?? ""}
            className={inputClassName}
          >
            <option value="">All categories</option>
            {LISTING_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex w-full flex-col gap-1 text-sm sm:w-40">
          <span className="font-medium text-foreground">Location</span>
          <input
            type="text"
            name="location"
            defaultValue={params.location ?? ""}
            placeholder="e.g. Etobicoke"
            className={inputClassName}
          />
        </label>

        <div className="flex w-full items-end gap-2 sm:w-auto">
          <label className="flex w-full flex-col gap-1 text-sm sm:w-24">
            <span className="font-medium text-foreground">Min price</span>
            <input
              type="number"
              name="price_min"
              min="0"
              step="0.01"
              defaultValue={params.price_min ?? ""}
              placeholder="Min $"
              className={inputClassName}
            />
          </label>

          <label className="flex w-full flex-col gap-1 text-sm sm:w-24">
            <span className="font-medium text-foreground">Max price</span>
            <input
              type="number"
              name="price_max"
              min="0"
              step="0.01"
              defaultValue={params.price_max ?? ""}
              placeholder="Max $"
              className={inputClassName}
            />
          </label>

          <label className="flex w-full flex-col gap-1 text-sm sm:w-24">
            <span className="font-medium text-foreground">Per</span>
            <select
              name="price_unit"
              defaultValue={isValidPriceUnit(params.price_unit) ? params.price_unit : "day"}
              className={inputClassName}
            >
              {PRICE_UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="submit"
          className="flex h-10 w-full items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc] sm:w-auto"
        >
          Apply filters
        </button>

        {hasActiveFilter && (
          <Link
            href="/listings"
            className="w-full text-center text-sm font-medium text-foreground underline sm:w-auto sm:text-left"
          >
            Clear filters
          </Link>
        )}
      </form>

      {cards.length === 0 ? (
        hasActiveFilter ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-black/[.08] py-16 text-center dark:border-white/[.145]">
            <p className="text-foreground">No tools match your filters.</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Try adjusting your search.</p>
            <Link href="/listings" className="text-sm font-medium text-foreground underline">
              Clear filters
            </Link>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-black/[.08] py-16 text-center dark:border-white/[.145]">
            <p className="text-foreground">No listings yet.</p>
            <Link
              href={user ? "/listings/new" : "/signup"}
              className="text-sm font-medium text-foreground underline"
            >
              Be the first to list a tool!
            </Link>
          </div>
        )
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

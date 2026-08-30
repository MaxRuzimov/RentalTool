/**
 * Fixed category list (spec docs/design/m3-listings-spec.md §2). `value`
 * matches the `public.listing_category` Postgres enum in
 * supabase/migrations/00000000000002_listings.sql — kept in sync by hand,
 * there is no single source of truth shared across DB and app code for MVP.
 */
export const LISTING_CATEGORIES = [
  { value: "power_tools", label: "Power Tools" },
  { value: "hand_tools", label: "Hand Tools" },
  { value: "ladders_access", label: "Ladders & Access" },
  { value: "lawn_garden", label: "Lawn & Garden" },
  { value: "cleaning_pressure_washers", label: "Cleaning & Pressure Washers" },
  { value: "generators_power", label: "Generators & Power" },
  { value: "automotive", label: "Automotive" },
  { value: "construction_heavy_equipment", label: "Construction & Heavy Equipment" },
  { value: "painting", label: "Painting" },
  { value: "plumbing", label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "moving_hauling", label: "Moving & Hauling" },
  { value: "party_event", label: "Party & Event" },
  { value: "other", label: "Other" },
] as const;

export type ListingCategory = (typeof LISTING_CATEGORIES)[number]["value"];

export function categoryLabel(value: string): string {
  return LISTING_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export const PRICE_UNITS = [
  { value: "hour", label: "hour" },
  { value: "day", label: "day" },
  { value: "week", label: "week" },
] as const;

export type PriceUnit = (typeof PRICE_UNITS)[number]["value"];

/** Always `$X.XX / unit` (spec §9). */
export function formatPrice(amount: number, unit: string): string {
  return `$${amount.toFixed(2)} / ${unit}`;
}

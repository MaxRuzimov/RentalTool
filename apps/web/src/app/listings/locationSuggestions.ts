"use server";

// M19 (spec docs/design/location-autocomplete-spec.md §4.2): deliberately
// separate from ./actions.ts, which stays focused on listing CRUD mutations.
// This is an unrelated read-only helper — the only thing in this app allowed
// to call Nominatim's /search endpoint for multi-result suggestions.

import { searchLocationSuggestions } from "@/lib/listings/geocode";
import type { LocationSuggestion } from "@/components/listings/LocationAutocompleteField";

export async function getLocationSuggestions(query: string): Promise<LocationSuggestion[]> {
  const results = await searchLocationSuggestions(query, 5);
  return results; // shape is already { label, lat, lng } — no supabase/cache involvement (§5)
}

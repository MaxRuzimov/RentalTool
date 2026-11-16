import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * M17 (spec docs/design/location-map-spec.md §3.1): geocodes a listing's
 * free-text `location` into a raw (un-fuzzed) lat/lng, checking
 * `geocode_cache` first and falling back to OSM Nominatim. Plain server-side
 * helper, NOT itself `"use server"` (only imported from
 * apps/web/src/app/listings/actions.ts, which is `"use server"` and must
 * only export async functions — this file stays a regular module, same
 * convention as @/lib/listings/categories, and must never be imported from a
 * Client Component).
 *
 * Never throws: every failure mode (no match, non-200, timeout, network
 * error) is logged with console.error and resolves to `null`, which every
 * caller treats as a normal, expected outcome — a geocoding failure must
 * never block listing creation/editing (§3.3/§3.4).
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "RentalTool-GTA/1.0 (https://rental-tool-web.vercel.app)";
const TIMEOUT_MS = 5000;

type LatLng = { lat: number; lng: number };

function normalizeLocationKey(locationText: string): string {
  return locationText.trim().toLowerCase();
}

export async function geocodeLocation(
  supabase: SupabaseClient,
  locationText: string,
): Promise<LatLng | null> {
  const locationKey = normalizeLocationKey(locationText);
  if (!locationKey) {
    return null;
  }

  const { data: cached, error: cacheError } = await supabase
    .from("geocode_cache")
    .select("lat, lng")
    .eq("location_key", locationKey)
    .maybeSingle();

  if (cacheError) {
    // Cache is a pure optimization, never a correctness dependency — fall
    // through to the live Nominatim lookup rather than failing here.
    console.error("geocodeLocation: cache lookup failed", cacheError);
  } else if (cached) {
    return { lat: cached.lat, lng: cached.lng };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let result: LatLng | null = null;
  try {
    const query = `${locationText}, Ontario, Canada`;
    const url = `${NOMINATIM_URL}?format=json&limit=1&countrycodes=ca&q=${encodeURIComponent(query)}`;

    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error("geocodeLocation: Nominatim returned non-200", response.status);
      return null;
    }

    const body = (await response.json()) as Array<{ lat?: string; lon?: string }>;
    const first = Array.isArray(body) ? body[0] : undefined;
    const lat = first ? Number(first.lat) : NaN;
    const lng = first ? Number(first.lon) : NaN;

    if (!first || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      // No match for this text — expected/normal, not an error worth logging.
      return null;
    }

    result = { lat, lng };
  } catch (err) {
    console.error("geocodeLocation: Nominatim request failed", err);
    return null;
  } finally {
    clearTimeout(timeout);
  }

  if (result) {
    // Best-effort cache write: if this races another request caching the
    // same key concurrently (or otherwise fails), swallow the error and
    // still return the geocoded point.
    const { error: insertError } = await supabase
      .from("geocode_cache")
      .insert({ location_key: locationKey, lat: result.lat, lng: result.lng });
    if (insertError) {
      console.error("geocodeLocation: cache insert failed", insertError);
    }
  }

  return result;
}

export type LocationSuggestionResult = { label: string; lat: number; lng: number };

/**
 * M19 (spec docs/design/location-autocomplete-spec.md §4.2/§5): sibling to
 * `geocodeLocation` above, used for the multi-result autocomplete dropdown.
 * Deliberately uncached (§5) and never touches `geocode_cache` — reuses the
 * same `User-Agent`, 5s timeout, and countrycodes=ca + ", Ontario, Canada"
 * query biasing, but requests `limit=5` and maps every result instead of
 * taking only the first.
 *
 * Never throws: every failure mode (query too short, non-200, timeout,
 * network error, empty body) resolves to `[]`, logged via console.error
 * (except the "too short"/"no match" cases, which are expected/normal).
 */
export async function searchLocationSuggestions(
  queryText: string,
  limit = 5,
): Promise<LocationSuggestionResult[]> {
  const trimmed = queryText.trim();
  if (trimmed.length < 3) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const query = `${trimmed}, Ontario, Canada`;
    const url = `${NOMINATIM_URL}?format=json&limit=${limit}&countrycodes=ca&q=${encodeURIComponent(query)}`;

    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error("searchLocationSuggestions: Nominatim returned non-200", response.status);
      return [];
    }

    const body = (await response.json()) as Array<{
      lat?: string;
      lon?: string;
      display_name?: string;
    }>;

    if (!Array.isArray(body)) return [];

    return body
      .map((item) => {
        const lat = Number(item.lat);
        const lng = Number(item.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || !item.display_name) {
          return null;
        }
        // Label derivation (§5): first two comma-separated segments of
        // Nominatim's `display_name`, e.g. "Etobicoke, Toronto, Golden
        // Horseshoe, Ontario, M9A, Canada" -> "Etobicoke, Toronto".
        const label = item.display_name
          .split(",")
          .slice(0, 2)
          .map((segment) => segment.trim())
          .join(", ");
        return { label, lat, lng };
      })
      .filter((result): result is LocationSuggestionResult => result !== null);
  } catch (err) {
    console.error("searchLocationSuggestions: Nominatim request failed", err);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

const METERS_PER_DEGREE_LAT = 111_320;
const JITTER_MIN_METERS = 150;
const JITTER_MAX_METERS = 300;

/**
 * Privacy jitter (spec §4): offsets a raw geocoded point by a random
 * 150-300m distance in a random 0-360deg bearing, using the standard
 * equirectangular approximation (accurate enough at this scale — no need
 * for a more exact geodesic formula for a sub-300m offset). Must be called
 * exactly once per geocode and the result persisted — never recomputed per
 * page view, never re-rolled on an edit that doesn't change the `location`
 * text (see actions.ts).
 */
export function jitterCoordinates({ lat, lng }: LatLng): LatLng {
  const distanceMeters = JITTER_MIN_METERS + Math.random() * (JITTER_MAX_METERS - JITTER_MIN_METERS);
  const bearingRadians = Math.random() * 2 * Math.PI;

  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180);

  const deltaLat = (distanceMeters * Math.cos(bearingRadians)) / METERS_PER_DEGREE_LAT;
  const deltaLng =
    metersPerDegreeLng === 0 ? 0 : (distanceMeters * Math.sin(bearingRadians)) / metersPerDegreeLng;

  return { lat: lat + deltaLat, lng: lng + deltaLng };
}

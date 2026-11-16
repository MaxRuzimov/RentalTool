"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { formatPrice } from "@/lib/listings/categories";

/**
 * M18 (spec docs/design/location-map-spec.md §10.3): the actual
 * Leaflet/react-leaflet implementation for the browse/search-page map view.
 * Rendered only via ListingsMapViewLoader's `next/dynamic(..., { ssr: false })`
 * — this file must never be statically imported into a Server Component,
 * since Leaflet touches `window`/`document` at module-evaluation time.
 */

export type ListingMapPin = {
  id: string;
  title: string;
  price_amount: number;
  price_unit: string;
  lat: number;
  lng: number;
};

// GTA-centered fallback view (~downtown Toronto) used whenever there are
// zero pins to fit bounds to — zero filtered results, or every filtered
// result lacks lat/lng. Also used as MapContainer's own *initial* center/
// zoom props (not a placeholder value swapped in later), so there is never
// a blank/undefined frame before the bounds-fit effect below runs.
const GTA_FALLBACK_CENTER: [number, number] = [43.6532, -79.3832];
const GTA_FALLBACK_ZOOM = 10;

// Same on-brand divIcon pin as ListingLocationMap.tsx (§5.3) — reused
// verbatim rather than redefined, so the single-listing map and this
// browse-page map read as the same visual language.
const pinIcon = L.divIcon({
  className: "",
  html: `
    <svg width="28" height="38" viewBox="0 0 28 38" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 24 14 24s14-13.5 14-24c0-7.732-6.268-14-14-14z"
        fill="var(--primary)"
      />
      <circle cx="14" cy="14" r="5.5" fill="#ffffff" />
    </svg>
  `,
  iconSize: [28, 38],
  iconAnchor: [14, 38],
  popupAnchor: [0, -34],
});

/**
 * Runs once on mount and whenever `pins` changes (e.g. the user applies a
 * new filter and the page re-renders with a different pin set). Three
 * explicit branches — see §10.5 for why each exists and what degenerate
 * case it covers:
 *   0 pins    -> GTA fallback view
 *   1 pin     -> setView at a fixed, reasonable zoom (fitBounds on a single
 *                point zooms to maxZoom, which looks "broken/too close")
 *   2+ pins   -> fitBounds, capped with maxZoom so pins that are all at an
 *                identical (or near-identical) point don't also zoom to
 *                the map's absolute maxZoom on a technically-zero-size box
 */
function FitBounds({ pins }: { pins: ListingMapPin[] }) {
  const map = useMap();
  useEffect(() => {
    if (pins.length === 0) {
      map.setView(GTA_FALLBACK_CENTER, GTA_FALLBACK_ZOOM);
      return;
    }
    if (pins.length === 1) {
      map.setView([pins[0].lat, pins[0].lng], 14);
      return;
    }
    const bounds = L.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 15 });
  }, [pins, map]);
  return null;
}

export default function ListingsMapView({ pins }: { pins: ListingMapPin[] }) {
  return (
    <MapContainer
      center={GTA_FALLBACK_CENTER}
      zoom={GTA_FALLBACK_ZOOM}
      maxZoom={18}
      scrollWheelZoom={false}
      className="h-[60vh] w-full rounded-2xl border border-line overflow-hidden"
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      <FitBounds pins={pins} />
      {pins.map((pin) => (
        <Marker key={pin.id} position={[pin.lat, pin.lng]} icon={pinIcon}>
          <Popup>
            <p className="text-sm font-medium text-foreground">{pin.title}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {formatPrice(pin.price_amount, pin.price_unit)}
            </p>
            <a
              href={`/listings/${pin.id}`}
              className="text-xs font-medium text-accent underline-offset-2 hover:underline"
            >
              View listing
            </a>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

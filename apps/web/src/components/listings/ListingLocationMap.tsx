"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, Circle, Popup } from "react-leaflet";

/**
 * M17 (spec docs/design/location-map-spec.md §5.2/§5.3): the actual
 * Leaflet/react-leaflet implementation. Rendered only via
 * ListingLocationMapLoader's `next/dynamic(..., { ssr: false })` — this file
 * must never be statically imported into a Server Component, since Leaflet
 * touches `window`/`document` at module-evaluation time.
 *
 * Approximate-area circle radius (§5.3): 250m, the midpoint of the §4
 * jitter range (150-300m) — illustrative, not a literal claim about the
 * exact jitter distance used for this listing's point.
 */
const CIRCLE_RADIUS_METERS = 250;

// `--primary` resolves at paint time from globals.css (light: #c2410c,
// dark: #f97316 via a prefers-color-scheme media query on the same custom
// property) — using the CSS var directly here keeps this on-brand in both
// themes without hand-duplicating the hex values.
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

export default function ListingLocationMap({
  lat,
  lng,
  title,
  location,
}: {
  lat: number;
  lng: number;
  title: string;
  location: string;
}) {
  const position: [number, number] = [lat, lng];

  return (
    <MapContainer
      center={position}
      zoom={14}
      maxZoom={18}
      scrollWheelZoom={false}
      className="h-64 w-full rounded-2xl border border-line overflow-hidden"
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      <Circle
        center={position}
        radius={CIRCLE_RADIUS_METERS}
        pathOptions={{ color: "var(--primary)", fillColor: "var(--primary)", fillOpacity: 0.15, weight: 1 }}
      />
      <Marker position={position} icon={pinIcon}>
        <Popup>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{location}</p>
        </Popup>
      </Marker>
    </MapContainer>
  );
}

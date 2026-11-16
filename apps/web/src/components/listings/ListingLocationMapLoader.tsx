"use client";

import dynamic from "next/dynamic";

/**
 * M17 (spec docs/design/location-map-spec.md §5.2): `ssr: false` is only
 * legal inside a Client Component's own `next/dynamic` call in the current
 * App Router model — this file is the client-component half of that split,
 * so `apps/web/src/app/listings/[id]/page.tsx` (a Server Component) can
 * statically import and render this loader with no special handling, while
 * the actual Leaflet implementation (ListingLocationMap, which touches
 * `window`/`document` at module-evaluation time) never runs during SSR.
 */
const ListingLocationMap = dynamic(() => import("./ListingLocationMap"), {
  ssr: false,
  loading: () => <div className="h-64 w-full rounded-2xl border border-line bg-surface-muted" />,
});

export default function ListingLocationMapLoader({
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
  return <ListingLocationMap lat={lat} lng={lng} title={title} location={location} />;
}

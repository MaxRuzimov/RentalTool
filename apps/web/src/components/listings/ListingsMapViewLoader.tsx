"use client";

import dynamic from "next/dynamic";

/**
 * M18 (spec docs/design/location-map-spec.md §10.3, mirroring §5.2's
 * ListingLocationMapLoader pattern): `ssr: false` is only legal inside a
 * Client Component's own `next/dynamic` call in the current App Router
 * model — this file is the client-component half of that split, so
 * `apps/web/src/app/listings/page.tsx` (a Server Component) can statically
 * import and render this loader with no special handling, while the actual
 * Leaflet implementation (ListingsMapView, which touches `window`/`document`
 * at module-evaluation time) never runs during SSR.
 */
const ListingsMapView = dynamic(() => import("./ListingsMapView"), {
  ssr: false,
  loading: () => <div className="h-[60vh] w-full rounded-2xl border border-line bg-surface-muted" />,
});

type ListingMapPin = {
  id: string;
  title: string;
  price_amount: number;
  price_unit: string;
  lat: number;
  lng: number;
};

export default function ListingsMapViewLoader({ pins }: { pins: ListingMapPin[] }) {
  return <ListingsMapView pins={pins} />;
}

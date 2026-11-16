# M17 — Location Map on Listing Detail Page

Status: ready for implementation
Scope: `apps/web` only (schema + one server-side geocoding helper + listing
detail page + listing create/edit actions). No mobile/Expo changes — same
boundary M5/M15 held ("a mobile-equivalent spec is written separately when/if
mobile picks this up"). No payment/account/billing dependency: map tiles are
OpenStreetMap (free, no API key), geocoding is OSM Nominatim (free, no API
key). Nothing in this spec requires Max to create any account or spend any
money.

## 0. Why, and why this shape

Max asked for a location map on listings ("Locationg map qo'sh"). Today
`listings.location` (`00000000000002_listings.sql` line 34) is free text
(e.g. "Etobicoke") with no coordinates anywhere in the schema. This spec adds
approximate coordinates, derived once from that free text at listing
create/edit time, and renders them as a map on the listing detail page.

Two decisions are made here without stakeholder input, per the standing
delegation (PROJECT_BRIEF.md "Max faqat strategik qarorlar qabul qiladi"):

- **No Google Maps.** Google's Maps Platform requires a Google Cloud billing
  account — a real money/account decision this project avoids unless
  PROJECT_BRIEF.md already called for it (it doesn't). Leaflet + OpenStreetMap
  tiles need no account and no billing, so that dependency is skipped
  entirely rather than escalated.
- **No calendar-grid-style "build a custom map widget from scratch."**
  Leaflet is a mature, widely-used library that already solves tile
  rendering, pan/zoom, and marker placement; reimplementing that by hand
  would be the same mistake M15 §3 explicitly avoided in the other
  direction (building custom UI where a well-understood off-the-shelf
  pattern is cheaper and more correct).

## 1. Scope

**In scope:**
- `listings.lat` / `listings.lng` nullable columns, populated by geocoding
  `location` once at create/edit time (not per page view).
- A `geocode_cache` table so repeated/common location strings (e.g. many
  listings in "Etobicoke") don't each cost a separate Nominatim lookup.
- Privacy-preserving coordinate jitter (§4) — the stored/displayed point is
  never the raw geocoded point.
- A map on the listing detail page (`apps/web/src/app/listings/[id]/page.tsx`)
  showing the listing's approximate location, on-brand styled, with required
  OSM attribution.
- Graceful degradation when geocoding fails or a listing predates this
  feature: no map section renders at all (§5.4) — never a blocking error on
  listing create/edit.

**Explicitly out of scope / deferred (see §8):**
- A map view on the browse/search page (`apps/web/src/app/listings/page.tsx`).
  Proposed and deliberately deferred — see §8 for why and what it would take.
- Any exact-address capture, display, or exchange mechanism. This product has
  no such mechanism today (contact is via chat/phone, arranged by the two
  parties per PROJECT_BRIEF.md's MVP scope) and this spec does not add one —
  the map only ever shows an approximate area, never a precise address, at
  any point in the flow, booked or not.
- Any change to the `location` text field itself (still free text, still the
  field shown everywhere today) or to search/filtering behavior.
- Map clustering, geolocation ("tools near me"), distance sorting/filtering.

## 2. Schema

New migration (next in sequence after `00000000000008_enforce_max_listing_images.sql`,
so `00000000000009_listing_location_map.sql`). Reference shape — exact SQL,
naming, and comment style are backend-engineer's call, same convention as
every prior spec in this repo:

```sql
alter table public.listings
  add column lat double precision,
  add column lng double precision;

-- Both nullable: a listing with no successful geocode simply has no map
-- (§5.4), and this never blocks listing creation/editing (§3.4).
-- Invariant worth a check constraint: both-null or both-not-null (never one
-- without the other) — add `check ((lat is null) = (lng is null))`.

-- Caches a RAW (un-fuzzed) geocode result per normalized location string, so
-- two listings in "Etobicoke" (or the same listing re-geocoded on an
-- unrelated edit) don't each cost a Nominatim lookup. This is NOT where
-- privacy fuzzing happens — see §4 for why the fuzz is applied per-listing,
-- after this cache, and never stored here.
create table public.geocode_cache (
  location_key text primary key, -- normalized: trim + lowercase of the free-text location
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now()
);

alter table public.geocode_cache enable row level security;

-- Not sensitive data (a neighborhood-name -> public-landmark-level
-- coordinate pair, same precision OSM would give anyone querying its public
-- API), so any authenticated user's listing create/edit flow can read and
-- append to it. No update/delete policy: this is an append-only cache: a bad
-- entry is corrected via a migration/manual fix, not exposed as an app
-- write path.
create policy "Authenticated users can read the geocode cache"
  on public.geocode_cache for select
  to authenticated
  using (true);

create policy "Authenticated users can add geocode cache entries"
  on public.geocode_cache for insert
  to authenticated
  with check (true);
```

Why a separate cache table rather than caching only in-memory/per-request:
Vercel serverless functions don't share memory across invocations, so an
in-process cache would do nothing across different listing creations. A DB
table is the only cache that actually survives between requests in this
deployment model.

## 3. Geocoding flow

### 3.1 New helper: `apps/web/src/lib/listings/geocode.ts`

Server-only module (imported only from `apps/web/src/app/listings/actions.ts`,
which is already `"use server"` — this file itself is a plain helper, not a
Server Action, so it must stay free of any export shape that would trip the
"no non-async exports in a `use server` file" review check; keep it a
regular, non-`"use server"` `.ts` module, same as `@/lib/listings/categories`
etc., and never import it from a Client Component).

Contract:

```ts
export async function geocodeLocation(
  supabase: SupabaseClient,
  locationText: string,
): Promise<{ lat: number; lng: number } | null>
```

Behavior:
1. Normalize: `locationText.trim().toLowerCase()` → `location_key`. Empty
   string → return `null` immediately (shouldn't happen, `location` is
   required non-empty, but cheap to guard).
2. Look up `geocode_cache` by `location_key`. Hit → return its `{lat, lng}`
   (raw point; jitter is applied by the caller, §4, not here).
3. Miss → call Nominatim:
   ```
   GET https://nominatim.openstreetmap.org/search
     ?format=json
     &limit=1
     &countrycodes=ca
     &q=<locationText>, Ontario, Canada
   ```
   with headers:
   - `User-Agent: RentalTool-GTA/1.0 (https://rental-tool-web.vercel.app)` —
     Nominatim's usage policy requires a real, descriptive User-Agent
     identifying the application; this is not optional decoration.
   - A 5-second timeout via `AbortController` — a hung geocode call must
     never hang listing creation.
   Appending ", Ontario, Canada" to every query keeps results anchored to
   this marketplace's actual market (GTA/Canada, per PROJECT_BRIEF.md) rather
   than matching a same-named place elsewhere in the world for a bare
   neighborhood name like "Etobicoke".
4. No result, non-200 response, timeout, or network error → log it
   (`console.error`, same convention as every other "log and degrade" path
   in this codebase, e.g. `listing_approved_booking_ranges`'s failure
   handling) and return `null`. **Never throws** — every caller treats this
   as a normal, expected outcome, not an exceptional one.
5. On a real hit, insert `{ location_key, lat, lng }` into `geocode_cache`
   (best-effort — if the insert itself fails, e.g. a race with another
   request caching the same key concurrently, swallow that error and still
   return the geocoded point; the cache is a pure optimization, never a
   correctness dependency).

### 3.2 Rate limiting

Nominatim's usage policy caps usage at ~1 request/second. This helper is only
ever called synchronously, once, inside a single user-initiated
`createListing`/`updateListing` call — there is no batch/bulk path anywhere
in this app that could call it in a tight loop, and the cache (§2) absorbs
repeat lookups of common location strings. At MVP scale (one listing created
or edited at a time, by one user, through one form submit) this naturally
stays well under the policy's limit without any explicit queue/throttle.
Flagged for revisit only if a future bulk-import or admin tool ever calls
this helper in a loop — that caller would need its own explicit ≥1 req/sec
throttle; this spec does not build one preemptively.

### 3.3 Where it's called from — `actions.ts`

- **`createListing`:** after the fields are validated (`parseListingFields`)
  and before/around the insert, call `geocodeLocation(supabase, values.location)`,
  apply jitter (§4) to a non-null result, and include `lat`/`lng` (or both
  `null`) in the `insert(...)` payload alongside the existing fields.
- **`updateListing`:** only re-geocode if the submitted `location` differs
  (case-sensitively is fine; normalize the same way as `location_key` for the
  comparison) from the existing row's `location`. If unchanged, carry the
  existing `lat`/`lng` through untouched — editing title/price/description
  must not cost a geocode call or silently re-roll the jitter on a listing
  whose map pin a renter may already be looking at. If the location text did
  change, re-geocode and re-jitter exactly like `createListing`.
- Both actions stay inside their existing try/catch; a geocoding failure
  inside that block must never bubble up as the action's own error — it's
  swallowed by `geocodeLocation` itself returning `null` (§3.1 point 4), and
  `null` is a perfectly valid value for `lat`/`lng` on insert/update.
- **Listing creation/editing is never blocked on this.** No new validation
  path makes `lat`/`lng` required; the listing saves with or without them,
  consistent with the task's own fallback decision.

### 3.4 Failure / fallback behavior (explicit)

| Situation | Behavior |
|---|---|
| Nominatim returns no match for the text | `lat`/`lng` stay `null`; listing saves normally; no map on the detail page (§5.4). |
| Nominatim times out / network error | Same as above. |
| Nominatim is fine but returns a wildly wrong country/continent match | Not specially detected in this pass (no server-side "is this plausibly in Ontario" sanity check beyond `countrycodes=ca` in the query) — flagged in §9 as a possible future hardening, not required for MVP given the explicit `countrycodes=ca` scoping already narrows this substantially. |
| A listing created before this migration ships | `lat`/`lng` are `null` (migration adds nullable columns, no backfill) — no map renders for pre-existing listings until the owner next edits them (which re-triggers geocoding only if they change the location text — see §9 for the backfill tradeoff this implies). |

## 4. Privacy: coordinate fuzzing

**This is a P2P marketplace where a renter may be looking up a stranger's
listing before any relationship exists between them.** `location` today is
already coarse (a neighborhood name, not a street address), but Nominatim can
still resolve some inputs to a precise point (e.g. a named landmark, a
specific intersection, or a surprisingly exact match for an unusual string).
The map must never let a visitor read off what looks like — or actually is —
someone's exact address, for the same reason Airbnb and similar marketplaces
only ever show an approximate/fuzzed pin before a booking is confirmed, and
(per §1's out-of-scope note) this product has **no** "reveal exact address"
step even after a booking, so the map must never imply more precision than
the product actually has at any stage of the flow.

**Decision: jitter the geocoded point once, at geocode time, by a random
offset of 150–300m in a random direction, and persist only the jittered
point.** The raw/un-fuzzed point is never written to `listings` at all — only
to `geocode_cache` (§2), which exists purely to save Nominatim calls and is
not displayed anywhere in the app.

- **Random distance, not a fixed one:** a fixed offset (e.g. always exactly
  300m north) would be reversible by anyone who knew the convention,
  defeating the point. A random distance in [150m, 300m) and a random
  bearing in [0°, 360°) means the true point could be anywhere on a ring
  around the displayed pin — no fixed relationship to back out.
- **Why a floor of 150m, not 0m:** a jitter that occasionally lands very
  close to 0 would occasionally show something close to the true point by
  chance. A non-zero floor guarantees meaningful displacement every time.
- **Why a ceiling of 300m, not larger:** large enough to meaningfully
  obscure a specific address, small enough that the pin still reads as "this
  general area," which is the actual product goal (show roughly where the
  tool is, e.g. which part of Etobicoke) — not "show nothing useful."
- **Computed once and persisted, not recomputed per page view:** if the
  jitter were re-randomized on every render, (a) the pin would visibly jump
  around between page loads, which looks like a bug, not a feature, and (b)
  a motivated viewer could load the page repeatedly and average many
  samples to triangulate the true point — defeating the fuzzing entirely.
  Storing one fixed jittered value closes both problems.
- **Re-rolled only when the underlying location text actually changes**
  (§3.3) — not on every unrelated edit — so a listing's pin stays stable
  across normal owner edits (price tweaks, description updates), which
  matters for a renter who bookmarked/previously viewed the listing.
- Offset math: convert a (distance, bearing) pair to a lat/lng delta using
  the standard equirectangular approximation (1° latitude ≈ 111,320m;
  1° longitude ≈ 111,320m × cos(latitude)) — accurate enough at this
  precision for a 150–300m offset; no need for a more exact geodesic
  formula at this scale.

### 4.1 What this does NOT claim to do

This is obfuscation for casual/public viewing, not a cryptographic guarantee.
It is the same level of protection "approximate pin" marketplace features
generally provide, not a defense against a determined adversary cross-
referencing the listing's other details. That tradeoff is accepted here
exactly because it mirrors the established norm (Airbnb etc.) the task
explicitly pointed at, and because the alternative (showing nothing at all)
gives up the actual product value Max asked for.

## 5. Map UI

### 5.1 Dependencies

Add as real npm dependencies in `apps/web/package.json` (not a CDN
`<script>` tag):
- `leaflet` (latest 1.9.x)
- `react-leaflet` (latest 5.x — the major version built against React 19,
  which this app already uses per `apps/web/package.json`)
- `@types/leaflet` as a dev dependency

backend-engineer should run the actual `npm install` and confirm no peer-
dependency conflicts against React 19.2.8 / Next 16.3.3 before proceeding —
if the latest `react-leaflet` major turns out to need a different peer range
than expected, resolve to whatever major actually declares React 19 support
rather than forcing an incompatible version.

Leaflet's CSS must be imported too (`leaflet/dist/leaflet.css`) — import it
from the new map component file itself, not globally in `globals.css`, so it
only loads on pages that actually render a map.

### 5.2 SSR handling (the known Next.js + Leaflet failure mode)

Leaflet touches `window`/`document` at module-evaluation time, which breaks
under Next.js App Router SSR if imported naively into a Server Component
tree. Per this project's standing Next-16 caution (read
`node_modules/next/dist/docs` for the App Router's current documented
dynamic-import/client-component rules before writing this — do not assume an
older Next.js pattern still applies verbatim), the required shape is:

1. `apps/web/src/components/listings/ListingLocationMap.tsx` — `"use client"`,
   the actual Leaflet/`react-leaflet` implementation (tile layer, marker,
   circle, popup — §5.3).
2. `apps/web/src/components/listings/ListingLocationMapLoader.tsx` —
   `"use client"`, uses `next/dynamic` with `{ ssr: false }` to import
   `ListingLocationMap`, with a simple loading placeholder (a
   `h-64 w-full rounded-2xl border border-line bg-surface-muted` skeleton box,
   matching this app's existing placeholder convention, e.g.
   `ImagePlaceholder`). `ssr: false` is only legal inside a Client Component
   file in the current App Router model — hence the split into two files
   rather than one.
3. `apps/web/src/app/listings/[id]/page.tsx` (a Server Component) imports and
   renders `ListingLocationMapLoader` directly — a Server Component may
   statically import and render a Client Component with no special handling;
   the `ssr: false` dynamic import already lives inside that client file.

This same split is the reason M16's video-upload work called out
dynamic-import-with-ssr-false as a recurring risk — treat that prior note as
binding precedent for how this must be structured, not a one-off.

### 5.3 Map contents / on-brand styling

- Tile layer: standard OSM raster tiles
  (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`), `maxZoom={18}`.
- **Attribution: required, never removed or hidden.** Leaflet's default
  attribution control already renders `© OpenStreetMap contributors` when
  the tile layer's `attribution` prop is set to that string — set it, and do
  not pass `attributionControl={false}` or otherwise suppress it. This is an
  OSM tile-usage policy requirement, not a cosmetic choice.
- Marker: **do not use Leaflet's default `L.Icon` raster images** (the
  well-known "marker icon 404s under webpack/Next bundling" failure mode —
  avoided by sidestepping it entirely, not by patching asset paths). Use an
  `L.divIcon` with a small inline SVG/HTML pin in `--primary`
  (`#c2410c` light / `#f97316` dark — design-system.md §1.2), white glyph,
  i.e. an on-brand pin instead of Leaflet's default blue teardrop.
- **Approximate-area circle:** draw an `L.Circle` (via `react-leaflet`'s
  `<Circle>`) centered on the same jittered point, radius 250m (the
  midpoint of the §4 jitter range — an illustrative radius, not a literal
  claim about the exact jitter distance used for that listing), styled with
  a low-opacity `--primary` fill and stroke. This is a deliberate honesty
  device: a bare pin alone visually implies precision the data doesn't have;
  a soft circle around it communicates "somewhere in this area" the same way
  Airbnb's fuzzed-location circle does, consistent with the task's own
  reference point.
- Popup (on marker or circle click): listing title + the original free-text
  `location` string, e.g. *"DeWalt 20V Cordless Drill · Etobicoke"*. Popup
  chrome left as Leaflet's default shape/shadow (not worth custom CSS for a
  single small popup) but text uses the app's existing type scale
  (`text-sm font-medium text-foreground` for the title line,
  `text-xs text-zinc-500 dark:text-zinc-400` for the location line) via
  `react-leaflet`'s `<Popup>` accepting ordinary JSX children — no bespoke
  Leaflet CSS override needed for the type styling.
- Container: `h-64 w-full rounded-2xl border border-line overflow-hidden` —
  matches the existing card/media convention used for the photo/video blocks
  above it on the same page. Confirm in QA that `overflow-hidden` on the
  container doesn't visually clip Leaflet's attribution control (it
  shouldn't — the control renders inside Leaflet's own map pane, which is
  already clipped to the same bounds — but this is exactly the kind of thing
  to actually look at in a real browser, not just assume).

### 5.4 Placement + empty-state behavior

New section on `apps/web/src/app/listings/[id]/page.tsx`, placed after the
Description block and before the Owner block:

```tsx
{listing.lat != null && listing.lng != null && (
  <div className="mt-8 border-t border-line-strong pt-6">
    <h2 className="text-lg font-semibold text-foreground">Location</h2>
    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
      Approximate area shown for privacy — message the owner for exact pickup details.
    </p>
    <div className="mt-3">
      <ListingLocationMapLoader
        lat={listing.lat}
        lng={listing.lng}
        title={listing.title}
        location={listing.location}
      />
    </div>
  </div>
)}
```

**Renders nothing at all — no placeholder box, no "location unavailable"
message — when `lat`/`lng` are null** (geocoding failed, or the listing
predates this feature and hasn't been re-edited yet). This matches this
page's own existing convention (the `photoError`/`videoError` banners, and
M15's "renders nothing when `unavailableRanges` is empty") of never showing
an empty box for an absent feature.

The caption copy above deliberately does not promise an exact-address reveal
at any later stage (§1), since no such mechanism exists in this product.

`page.tsx`'s existing `listings` select needs `lat, lng` added to its column
list (currently `"id, owner_id, title, description, category, price_amount, price_unit, location"`).

## 6. Non-goals (explicit)

- **No browse/search-page map view in this pass** — proposed and deferred,
  see §8 for the full reasoning and what a fast-follow would need.
- **No change to the `location` text field, its validation, or how it's used
  in search/filtering** (`apps/web/src/app/listings/page.tsx`'s
  `ilike("location", ...)` filter is untouched).
- **No backfill migration for existing listings' `lat`/`lng`** — see §9 for
  the tradeoff; accepted as-is for this pass (owners naturally pick this up
  next time they edit a listing that changed its location text, or never, if
  they don't).
- **No exact-address capture or display anywhere**, booked or not (§1).
- **No geolocation/"near me" features, no distance sorting, no map
  clustering.**
- **Mobile (Expo)** — not covered, same boundary as M5/M15.
- **No admin tooling to re-geocode listings in bulk.**

## 7. Review checklist callouts (for code-reviewer)

- `geocode.ts` is a plain module, not itself `"use server"` — confirm it has
  no stray non-async export that would matter if it ever got a `"use server"`
  directive added by mistake, and confirm `actions.ts` (which IS `"use
  server"`) still only exports async functions after this change.
- Confirm `createListing`/`updateListing` do not partially apply a write
  before validation — geocoding must happen (or be skipped) using already-
  validated `parsed.values.location`, never raw unvalidated `formData`.
- Confirm the jitter math has no off-by-one / degenerate case at the
  boundaries (e.g. bearing exactly 0/360, distance exactly at the 150m floor
  or 300m ceiling) and that latitude/longitude delta signs are correct in all
  four hemisp...quadrant combinations relevant to GTA's actual coordinates
  (positive latitude, negative longitude — don't let a sign bug silently
  place pins in the wrong direction only detectable by eyeballing a map).
- No UTC-vs-Toronto timezone concerns apply to this feature (no dates
  involved) — listed per the standing checklist, not because this spec
  introduces any date handling.
- Confirm the SSR split (§5.2) is actually structured as documented — a
  `"use client"` file alone is not sufficient; `ssr: false` must specifically
  live inside a client-component file's own `next/dynamic` call, and
  `page.tsx` must not attempt `dynamic(..., { ssr: false })` directly itself
  (it's a Server Component).
- Confirm the production build check in §9/QA plan actually happened and
  actually exercises the map (not just `next build` succeeding with the
  component unused/unreached by any prerendered path) — this is the exact
  failure mode called out in the task brief.

## 8. Browse/search-page map view — proposed, deferred to a fast-follow

A list/map toggle on `apps/web/src/app/listings/page.tsx` (showing all
currently-filtered listings as pins, Airbnb-search-style) would be genuinely
valuable, but is meaningfully more scope than the detail-page map:

- It needs a bounding-box or "all visible pins" query shape distinct from the
  existing paginated/limited list query, plus marker clustering once more
  than a handful of listings share a viewport (a real near-term need —
  several listings in "Etobicoke" will visually overlap without clustering).
- It needs its own responsive layout decision (toggle control, split-view on
  desktop vs. stacked on mobile) that this spec's detail-page work doesn't
  touch at all.
- It would be the first interactive map a visitor sees before engaging with
  any specific listing, which raises the design bar (empty/loading states,
  what happens with zero filtered results on the map, zoom-to-fit behavior)
  higher than a single fixed-point detail-page map.

Per the same pattern as M6's deferred owner-reviews-renter and M8's deferred
mobile listing creation, this is logged as a clearly-scoped next milestone
rather than folded into this pass. Recorded in `MILESTONES.md` as a fast-
follow note on M17.

## 9. Left to backend-engineer / QA judgment

- Exact Nominatim query string formatting / whether `addressdetails=1` or
  other params are worth adding — §3.1 gives the required contract, not
  literal authoritative text.
- Whether to add a lightweight "does this look plausibly within the GTA/
  Ontario bounding box" sanity check on the returned point beyond
  `countrycodes=ca` — flagged in §3.4 as a possible hardening, not required.
- The backfill tradeoff for pre-existing listings (§6): leaving it to
  "re-geocodes on next edit that changes location text" versus writing a
  one-off backfill script run once against production. Given this is a
  nullable, additive, already-fail-open feature, no backfill is the default;
  if backend-engineer judges a one-time backfill cheap and worth doing, it
  must still go through the orchestrator for the actual production run
  (no direct production DB access per standing constraint), and must use the
  exact same `geocodeLocation` + jitter path as the live code (never a
  separate one-off script with its own, divergent logic).
- Exact radius value shown for the approximate-area circle (§5.3 proposes
  250m as the jitter range's midpoint) — a reasonable default, not a value
  worth debating further.
- Minor visual/spacing details not pinned above — implementer's normal
  judgment, consistent with every prior spec's closing note.

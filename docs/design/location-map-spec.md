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

## 10. Browse/search-page map view (M18 implementation)

Status: ready for implementation. This section resolves the §8 deferral —
read §1 (scope/non-goals), §4 (privacy jitter model — unchanged, consumed
as-is), and §5 (single-listing map conventions this section reuses rather
than reinvents) before implementing.

### 10.0 Why, and why this shape

§8 deferred this because a full "bounding-box query + clustering + its own
responsive layout" build was more scope than M17's detail-page map. At
current dataset scale (~4 listings total per the task brief), the bounding-
box query and clustering concerns are over-building for what the product
actually needs today: the browse page already computes exactly the filtered
result set a map view needs (§10.2), and 4 listings can never visually
collide badly enough to need clustering (§10.7). This section builds the
smallest correct version of §8's ask — same filtered query, same single-
listing map conventions (SSR split, on-brand pin, OSM attribution), new
toggle — and explicitly defers the two heavier pieces (clustering,
bounding-box querying) to whenever the dataset actually grows into needing
them, rather than building them preemptively.

### 10.1 Scope

**In scope:**
- A list/map toggle on `apps/web/src/app/listings/page.tsx`, defaulting to
  list view (today's unchanged behavior when the toggle is never touched).
- Map view renders one pin per listing in the *current filtered result set*
  — the same query `page.tsx` already runs for the list, with `lat, lng`
  added to its `.select(...)` column list. No new/separate query.
- Listings with null `lat`/`lng` are simply omitted from the map pins — never
  an error, never a placeholder marker for them (consistent with §5.4's
  "render nothing for an absent feature" convention).
- Auto-fit map bounds to the current pins on load, with a GTA-centered
  fallback view when there are zero pins to fit (§10.5).
- Tapping/clicking a pin opens a popup with title, price, and a link to the
  listing (§10.4).

**Explicitly out of scope / deferred — see §10.7:**
- Marker clustering.
- A separate bounding-box/viewport query (pins are always exactly the
  current filtered-and-`INDEX_LIMIT`-capped list, nothing more).
- A slide-up panel/drawer for pin details (popup is sufficient for now).
- Any change to the jitter/privacy model (§4) or to the `location` text
  field/search behavior (§6) — this section only adds a new *rendering* of
  coordinates that already exist and are already fuzzed by M17.
- Mobile/Expo — same boundary as the base spec and M5/M15.

**No DB migration or index needed.** The query is identical in shape to
today's list query (same filters, same `INDEX_LIMIT`, same table) — only the
selected column list grows by two already-existing nullable columns
(`lat`, `lng`). No new table, no new RLS policy, no new index: the existing
`listings` table scan/filter path is unchanged, just returning two more
columns per row.

### 10.2 Query / data changes — `apps/web/src/app/listings/page.tsx`

1. **Select list:** change
   ```ts
   .select("id, title, category, price_amount, price_unit, location")
   ```
   to
   ```ts
   .select("id, title, category, price_amount, price_unit, location, lat, lng")
   ```
   This is the only query-shape change. Every existing filter
   (`.eq("category", ...)`, `.ilike("location", ...)`, price filters,
   `.limit(INDEX_LIMIT)`) is untouched — the map pins are a *derived view* of
   the exact same `listings` rows the list already fetches, not a second
   query.

2. **Derive `mapPins` alongside the existing `cards` derivation**, from the
   raw `listings` rows (not from `cards`/`ListingCardData`, so
   `ListingCardData`'s shape — and `ListingCard.tsx`'s prop contract — stays
   untouched by this feature):
   ```ts
   type ListingMapPin = {
     id: string;
     title: string;
     price_amount: number;
     price_unit: string;
     lat: number;
     lng: number;
   };

   const mapPins: ListingMapPin[] = (listings ?? [])
     .filter(
       (l): l is typeof l & { lat: number; lng: number } =>
         l.lat != null && l.lng != null,
     )
     .map((l) => ({
       id: l.id,
       title: l.title,
       price_amount: l.price_amount,
       price_unit: l.price_unit,
       lat: l.lat,
       lng: l.lng,
     }));
   ```
   Note: the M17 §2 schema invariant (`check ((lat is null) = (lng is null))`)
   already guarantees a row can't have exactly one of the two set — this
   filter's type guard is a defensive/TS-narrowing convenience, not a
   correctness gap it's covering for.
3. The `ListingMapPin` type is exported from the new
   `ListingsMapView.tsx` (§10.3) and used here via that import — or declared
   locally in `page.tsx` and duplicated (inline, not imported) in the loader
   file, matching exactly how `ListingLocationMapLoader.tsx` already inlines
   its prop types today rather than importing them from
   `ListingLocationMap.tsx`. Either is fine; keep it consistent with
   whichever the implementer finds reads better, but do not create a
   three-way divergent copy of the same shape.
4. **`INDEX_LIMIT = 60` applies identically to both views.** There is no
   separate "show all matching pins regardless of the list cap" behavior —
   if a filtered search ever exceeds 60 rows, map view shows the same capped
   60 the list view would, for the same reason list view accepts that cap
   today (§8's original reasoning: no pagination UI required for MVP).

### 10.3 Component architecture

New files, mirroring `ListingLocationMap`/`ListingLocationMapLoader`'s exact
SSR-split pattern (§5.2) — do not rediscover that pattern, reuse it:

**`apps/web/src/components/listings/ListingsMapView.tsx`** — `"use client"`,
the actual `react-leaflet` implementation.

```tsx
"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { formatPrice } from "@/lib/listings/categories";

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
```

Notes on choices made above:
- `formatPrice` is imported directly from `@/lib/listings/categories` (the
  same pure, dependency-free module `ListingCard.tsx` already imports
  client-side) rather than having `page.tsx` pre-format a price string —
  keeps `ListingMapPin` a plain data shape and avoids a second place that
  needs to stay in sync with `formatPrice`'s `"$X.XX / unit"` convention.
- The popup's "View listing" link uses a plain `<a href>`, not `next/link`.
  `react-leaflet`'s `<Popup>` mounts its children into a DOM node Leaflet
  itself manages; a plain anchor is the simplest thing that is guaranteed to
  work there with zero edge cases, consistent with this spec's "simple,
  fast-to-build" bias — a full client-side-routed transition for a single
  popup link isn't worth the risk of chasing a next/link-inside-a-Leaflet-
  portal edge case. (The single-listing map's popup, §5.3, doesn't even
  need a link today — this is a new case, not a deviation from an existing
  pattern.)
- `scrollWheelZoom={false}` is kept consistent with `ListingLocationMap.tsx`
  — a scroll-wheel zoom on a map embedded in a normally-scrolling page is a
  well-known "trapped the user's scroll" footgun; disabling it here is the
  same mitigation M17 already applied.

**`apps/web/src/components/listings/ListingsMapViewLoader.tsx`** —
`"use client"`, the `next/dynamic(..., { ssr: false })` wrapper, same shape
as `ListingLocationMapLoader.tsx`:

```tsx
"use client";

import dynamic from "next/dynamic";

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
```

`page.tsx` (a Server Component) imports and renders only
`ListingsMapViewLoader` — exactly the same hand-off pattern §5.2 already
established: the Server Component never touches `next/dynamic` or Leaflet
directly, the `ssr: false` call lives inside this client file only.

### 10.4 Toggle mechanism — URL searchParam, not client-side-only state

**Decision: `?view=map` / absent (default) = list, as a new recognized
`searchParams` key on this page, exactly like `category`, `location`,
`price_min`, `price_max`, `price_unit` already are.**

Why, over a client-side-only toggle (e.g. `useState` behind a client
wrapper):

1. `page.tsx` is already a Server Component whose *entire* filter/display
   state lives in `searchParams` — every existing control on this page is a
   GET form field or a plain link that re-navigates with a new query string.
   Adding the one new piece of view state as local client component state
   would mean carving out client-side state management for a page that has
   deliberately had none so far, which is more moving parts than adding one
   more recognized `searchParams` key to a page that already treats every
   piece of its state this way.
2. **Shareable/bookmarkable for free.** A user who wants to send someone a
   link to "tools in Etobicoke, map view" gets exactly that, the same way
   `?category=power_tools` is already shareable today. A client-only toggle
   would silently reset to list view on every fresh navigation or shared
   link — a worse default than every other filter on this page already has.
3. **No hydration/flash-of-wrong-view risk.** The correct view renders on
   first server-rendered paint because it's derived from `searchParams`
   before any client JS runs — consistent with this page's SSR-first
   architecture.
4. This is independent from (and doesn't conflict with) the fact that the
   *map itself* still has to be a client component with `ssr: false`
   (Leaflet's DOM dependency, §5.2 — unavoidable regardless of how the
   toggle works). Two separate decisions: "which view is active" stays
   server-driven via `searchParams` exactly like every other control on this
   page; "how the map pane is drawn once active" is the client/SSR-false
   piece that was always going to be client-side no matter what.

Implementation in `page.tsx`:

```ts
type SearchParams = {
  category?: string;
  location?: string;
  price_min?: string;
  price_max?: string;
  price_unit?: string;
  view?: string;
};

// ...inside the component, alongside the other parsed params:
const view: "list" | "map" = params.view === "map" ? "map" : "list";

// Preserves every currently-active filter when switching views — the
// toggle is a plain link, not a form, so it must carry the current filter
// state itself rather than relying on a submit. Uses the raw `params`
// strings (not the already-narrowed/validated `category`/`trimmedLocation`
// etc.) because this is pure passthrough of whatever is already in the
// URL, not a second validation pass — if an invalid value were somehow in
// the URL already, round-tripping it unchanged is harmless and matches how
// every other link-with-querystring on this page already behaves.
function buildViewHref(targetView: "list" | "map", params: SearchParams): string {
  const qs = new URLSearchParams();
  if (params.category) qs.set("category", params.category);
  if (params.location) qs.set("location", params.location);
  if (params.price_min) qs.set("price_min", params.price_min);
  if (params.price_max) qs.set("price_max", params.price_max);
  if (params.price_unit) qs.set("price_unit", params.price_unit);
  if (targetView === "map") qs.set("view", "map");
  // view=list is the default and intentionally omitted, so a plain
  // "/listings" (no view param) always means list — keeps default/shared
  // URLs clean, matches how an absent category/location param already
  // means "no filter" rather than an explicit empty string.
  const qsString = qs.toString();
  return qsString ? `/listings?${qsString}` : "/listings";
}
```

### 10.5 Toggle UI — placement, markup, touch target

Placed directly below the existing filter `<form>` and above the
`cards.length === 0 ? ... : ...` branch (§10.6) — after filtering, before
results, same relative position Airbnb-style list/map toggles conventionally
use, and a natural reading order ("here's how I'm filtering" → "here's how
I want to view the results").

```tsx
<div
  role="group"
  aria-label="Results view"
  className="mb-4 inline-flex items-center gap-1 rounded-full border border-line bg-surface-muted p-1"
>
  <Link
    href={buildViewHref("list", params)}
    aria-current={view === "list" ? "true" : undefined}
    className={`flex h-11 min-w-[88px] items-center justify-center rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
      view === "list"
        ? "bg-primary text-primary-foreground"
        : "text-foreground hover:bg-surface"
    }`}
  >
    List
  </Link>
  <Link
    href={buildViewHref("map", params)}
    aria-current={view === "map" ? "true" : undefined}
    className={`flex h-11 min-w-[88px] items-center justify-center rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
      view === "map"
        ? "bg-primary text-primary-foreground"
        : "text-foreground hover:bg-surface"
    }`}
  >
    Map
  </Link>
</div>
```

- `h-11` (44px) matches `design-system.md` §4.1's "full-page-submit" button
  height tier — the tallest tier this project already has a convention for
  — chosen deliberately over the `h-10`/`h-9` tiers used for the filter
  form's own buttons, to satisfy a comfortable ≥44px touch target on phone
  width without inventing a new height value. `min-w-[88px]` gives each
  button a generous horizontal hit area too; two 88px+ buttons plus the
  segmented-control padding comfortably fit the narrowest common phone
  viewport (~360px) with no wrapping.
- Active/inactive treatment reuses the existing primary-button fill
  (`bg-primary text-primary-foreground`) for the selected view and a plain
  neutral hover (`text-foreground hover:bg-surface`) for the other — no new
  color introduced, same tokens as every other button on this page.
  `focus-visible` ring matches §4.9's standard treatment, applied to both.
- `aria-current="true"` on the active link is the one incremental a11y
  addition here — cheap, and gives assistive tech a way to know which view
  is selected without inventing a heavier tab/tablist ARIA pattern this
  codebase doesn't use anywhere else.
- This toggle renders unconditionally, even when `cards.length === 0` — it's
  a view *preference*, independent of whether the current filters happen to
  return results (§10.6).

### 10.6 Map container, layout, and the empty-state branches

Map container height: `h-[60vh]` (set on `ListingsMapView`'s `MapContainer`,
§10.3) — mobile-first per the task's framing (this app is primarily viewed
on phones): tall enough to be a genuinely useful map at phone width, short
enough that the toggle buttons, filter form, and (critically) the rest of
the page remain reachable by scrolling — the container is never `100vh`/
viewport-locked, so a user can always scroll past it by touching above or
below it. Leaflet's own touch-drag-to-pan behavior inside the map bounds is
the same, expected interaction model every production map embed uses
(Google Maps embeds, Airbnb's own search map) — lifting a finger and
starting a new touch gesture outside the map container scrolls the page
normally; this is not a "trapped scroll" bug, it's how map embeds on
scrolling pages universally behave, and is the same tradeoff M17's smaller
`h-64` single-listing map already made (only `scrollWheelZoom` is disabled,
touch-drag-to-pan is not).

`page.tsx`'s render, in full, replacing the current
`{cards.length === 0 ? ... : (<div className="grid ...">...)}` block:

```tsx
{/* Toggle renders unconditionally — a view preference, independent of
    whether the current filters return any results. */}
<div role="group" aria-label="Results view" className="mb-4 inline-flex ...">
  {/* §10.5 markup */}
</div>

{cards.length === 0 ? (
  hasActiveFilter ? (
    <EmptyState icon={SearchX} title="No tools match your filters." description="Try adjusting your search.">
      {/* unchanged */}
    </EmptyState>
  ) : (
    <EmptyState icon={PackageSearch} title="No listings yet.">
      {/* unchanged */}
    </EmptyState>
  )
) : view === "map" ? (
  <ListingsMapViewLoader pins={mapPins} />
) : (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {cards.map((listing) => (
      <ListingCard key={listing.id} listing={listing} />
    ))}
  </div>
)}
```

**The zero-results empty state is shared by both views, unchanged.** Both
existing `EmptyState` branches (`hasActiveFilter` / no listings at all) are
reached identically regardless of which `view` is selected — `cards.length`
(the same underlying query result `mapPins` is also derived from) is the
single source of truth for "are there any results," checked once, before
branching on `view`. A user who toggles to map view with zero filtered
results sees the exact same `EmptyState` the list view would show, not an
empty/broken map — the map component is never even rendered in that case.

Note: even in the non-empty case, it's possible for `cards.length > 0` while
`mapPins.length === 0` (every result in this filter happens to lack
`lat`/`lng` — e.g. all pre-date M17 and haven't been re-edited). That is
*not* treated as the zero-results empty state (the listings do exist and are
shown in list view) — in map view, this falls through to
`ListingsMapViewLoader` with an empty `pins` array, which (§10.3's `FitBounds`
0-pins branch) renders the GTA fallback view with simply no pins on it, same
as the zero-filtered-results case. This is a deliberate, narrow distinction:
"no results at all" gets the `EmptyState` treatment; "results exist but none
are mappable" gets a real (if pin-less) map, because the former is "nothing
to show" and the latter is "something to show, just not on this particular
view."

### 10.7 Non-goals / deferred (explicit)

- **No marker clustering in this pass.** Current dataset is ~4 listings
  total — building clustering now would be over-building for a problem that
  doesn't exist yet, the same judgment call §8 itself made about the
  detail-page map's simpler scope. **Revisit trigger:** once a filtered
  result set commonly exceeds roughly 15–20 markers sharing a single
  viewport (visually overlapping, hard to tap individually at normal zoom)
  — at that point, add `react-leaflet-cluster` or equivalent rather than
  hand-rolling clustering logic, consistent with this spec's "don't build
  custom what an off-the-shelf library already solves" stance (§0).
- **No separate bounding-box/viewport query.** Map pins are always exactly
  the current filtered-and-capped list query's rows with non-null
  `lat`/`lng` — never a second, broader query scoped to the map's visible
  area. If the catalog grows enough that `INDEX_LIMIT`'s 60-row cap starts
  meaningfully truncating results, that's a pagination problem affecting
  both views equally, not something this map view should solve on its own
  with a divergent query shape.
- **No slide-up panel/drawer for pin details.** The `<Popup>` (§10.3) is
  sufficient at this dataset scale and interaction complexity. Worth
  revisiting if a future pass wants a richer pin preview (e.g. a photo
  thumbnail, which a Leaflet popup can technically hold but starts to feel
  cramped) — not needed now.
- **No geolocation ("tools near me"), no distance sorting/filtering** — same
  deferral as the base spec §6, still holds; this section only adds a way to
  *see* the already-filtered set spatially, not a way to filter by distance.
- **No change to the privacy/jitter model (§4).** Pins render the already-
  fuzzed, already-persisted `lat`/`lng` values exactly as stored — this
  section is a pure new *rendering* of existing data, never a second place
  where fuzzing logic lives or could drift from §4's.
- **Mobile (Expo)** — not covered, same boundary as the base spec and
  M5/M15/M17.
- **No new DB index.** Explicitly confirmed not needed (§10.1): the query's
  filter/sort shape is unchanged from today, only two already-existing
  columns are added to the `select`.

### 10.8 Review checklist callouts (for code-reviewer)

- **No `"use server"` files touched.** `actions.ts` and every other Server
  Action file in this app are untouched by this section — confirm the PR
  implementing this doesn't incidentally touch `actions.ts`. (If it does for
  an unrelated reason, that change must still independently satisfy "every
  export from a `use server` file is async," but nothing in this spec
  requires touching it.)
- **No partial-apply/write-before-validation concern applies.** This is a
  read-only feature — no new mutation, no new form submission with side
  effects, nothing writes anything. Confirm the implementing PR doesn't
  introduce one inadvertently (e.g. no new Server Action should appear as
  part of this work at all).
- **Confirm the SSR split is structured correctly, per §5.2's precedent:**
  `next/dynamic(..., { ssr: false })` must live inside
  `ListingsMapViewLoader.tsx`'s own `"use client"` file — `page.tsx` (a
  Server Component) must only ever import/render `ListingsMapViewLoader`,
  never attempt a dynamic `ssr: false` import itself, and never statically
  import `ListingsMapView.tsx` directly (which would pull Leaflet's
  module-eval-time `window` access into the server render path).
- **Confirm `FitBounds`'s three-way branch (§10.3) actually covers all three
  degenerate cases, not just the common case:** zero pins (empty filtered
  set, or every result lacks `lat`/`lng`) renders the GTA fallback, not a
  blank/undefined map region; exactly one pin uses a fixed `setView` zoom
  rather than `fitBounds` (which would over-zoom on a zero-size box); two or
  more pins that happen to be at an identical or near-identical point (a
  real possibility — several listings in the same neighborhood could jitter
  to visually indistinguishable points at this zoom level) still produce a
  sensible, capped zoom via `fitBounds`'s `maxZoom: 15` option, not a
  snapped-to-`maxZoom={18}` over-zoomed tile view.
- **Confirm the zero-pins fallback is never a blank/broken map.** Because
  `MapContainer`'s own `center`/`zoom` props are set directly to
  `GTA_FALLBACK_CENTER`/`GTA_FALLBACK_ZOOM` (not some other placeholder
  swapped in only after the `FitBounds` effect runs), the very first paint
  — before React's effects have even fired — already shows the correct GTA
  default view. The effect's own 0-pins branch re-asserting the same
  `setView` is intentionally redundant/a no-op in that case, kept only for
  symmetry with the 1-pin and 2+-pin branches; confirm this redundancy was
  understood and not "optimized away" in a way that reintroduces a blank
  first frame.
- **Confirm `view=list` stays the true default** — a request to `/listings`
  with no `view` param at all (including every pre-existing bookmark/link to
  this page from before this feature shipped) must render exactly today's
  list behavior, byte-for-byte unchanged in the list-view branch itself.
- **Confirm the empty-state logic (§10.6) is keyed on `cards.length`, not
  `mapPins.length`,** for the "no results at all" branches — a filtered set
  that has real listings but zero mappable pins must still render the map
  (pin-less, on the GTA fallback view) in map view, not the `EmptyState`,
  per the explicit distinction drawn in §10.6's closing note.
- **No UTC-vs-Toronto timezone concern applies** — no dates involved, listed
  per the standing checklist only.

### 10.9 Left to engineer judgment

- Exact wording/order of the toggle's two labels ("List"/"Map") — not worth
  debating further, this is the obvious convention.
- Whether `buildViewHref` lives as a local function inside `page.tsx` or is
  extracted to a small shared helper — given it's only used twice (two
  `Link`s) on one page, a local function is simplest; no need to create a
  new shared module for it.
- Minor visual/spacing details not pinned above (exact gap values inside the
  toggle, whether the toggle sits flush against the filter form or has a
  larger gap above it) — implementer's normal judgment, consistent with
  every prior spec's closing note.
</content>
</invoke>

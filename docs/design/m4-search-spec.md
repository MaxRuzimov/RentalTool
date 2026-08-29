# M4 — Search & Filtering UX/UI Spec (Category, Location, Price)

Status: ready for implementation
Scope: `apps/web` (Next.js 16 App Router + Tailwind v4), Supabase Postgres — filtering only, on the existing public `/listings` browse page built in M3.
Non-goals for M4: keyword/full-text search on title or description (see §1), sorting controls other than the existing `created_at desc` order, saved searches, location radius/geo search, pagination beyond the M3 hard cap, any mobile (Expo) work.

## 0. Assumptions engineers should verify before starting

- M3 is merged: `/listings` exists exactly as described in `docs/design/m3-listings-spec.md` §5.4 and implemented in `apps/web/src/app/listings/page.tsx` — an unfiltered, server-rendered card grid, `status = 'published'`, ordered `created_at desc`, capped at 60 rows (`INDEX_LIMIT`).
- The 14-value category list lives in `apps/web/src/lib/listings/categories.ts` (`LISTING_CATEGORIES`) and is mirrored by hand in the `public.listing_category` Postgres enum (`supabase/migrations/00000000000002_listings.sql`). This spec's category filter reuses that exact same constant — no new list, no duplication.
- `listings.location` is free text (e.g. "Etobicoke, ON"), not structured — same convention as `profiles.city`, carried over unchanged from M3. This spec does not introduce geocoding, lat/lng, or a location-suggestion dropdown.
- `listings.price_amount` is `numeric(10,2)`; `listings.price_unit` is `text` constrained to `hour` / `day` / `week`. This is the crux of the price-filter design decision in §6.
- `/listings` is a server component today (`export default async function ListingsIndexPage()`), fetching directly via the Supabase server client — no client-side data fetching exists on this page. This spec keeps it a server component; filters are read from `searchParams` (a `Promise` in Next.js 16, same as `params` on `/listings/[id]`, per that route's existing `{ params, searchParams }: { params: Promise<...>; searchParams: Promise<...> }` pattern — must be `await`ed).

## 1. Scope confirmation — no keyword/title search in M4

`MILESTONES.md` M4 line item reads: "Qidiruv va filtrlash (kategoriya, joylashuv, narx)" — category, location, price. `PROJECT_BRIEF.md` doesn't mention keyword search anywhere. Per the task instruction, keyword/full-text search on `title`/`description` is left **entirely out of scope** for M4, not partially included:

- No search input box on `/listings`.
- No `q`/`search`/`keyword` query param.
- No `ILIKE`/full-text query against `title` or `description`.

Rationale for leaving it out rather than adding a "trivial" version: even a naive `title ILIKE '%q%'` box is a distinct feature surface (a text input styled and positioned differently from the three filter fields below, its own empty-state copy question, its own "does it combine with filters?" question) — not free just because it looks like one `ILIKE` call. Cheaper and cleaner to ship category/location/price cleanly now and add keyword search as its own well-scoped follow-up if the product actually needs it later.

## 2. Filter UI placement — top filter bar, not a sidebar

**Decision: a horizontal filter bar directly above the card grid on `/listings`, not a left sidebar.**

Reasons:
- `/listings` today is a single-column-of-content page (`max-w-5xl` centered container, no existing sidebar/two-column shell anywhere in the app). Introducing a sidebar would mean building a new two-column responsive layout (sidebar + main) from scratch, with its own collapse-to-drawer behavior on mobile — real new layout surface area for an MVP that's supposed to stay cheap.
- A top bar is a single `<form>` using the same plain-Tailwind, flex-wrap, no-component-library approach already used for the create/edit listing forms (M3 §9) — it just wraps to a second line on narrow viewports instead of needing a collapsible panel.
- A sidebar earns its keep when there are many filter groups or a long vertical list of options (e.g. many checkboxes); here there are exactly three filter concepts (category, location, price) and four/five fields — a single row/wrap-row is proportionate.

### Layout structure

Native HTML `<form method="GET" action="/listings">` rendered as a **client component wrapping plain form fields** (no JS required for the core behavior — a GET form submit naturally produces a shareable URL with a query string, which is exactly the requirement in §3). Placed between the page `<h1>` and the card grid:

```
┌─────────────────────────────────────────────────────────────────┐
│  Browse listings                                                 │   <- existing <h1>, unchanged
│                                                                    │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ [Category ▾]  [Location text input]  [$min] – [$max] [per▾] │  │  <- filter bar
│  │ [Apply filters]                          Clear filters (link)│  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                    │
│  [card] [card] [card]                                             │   <- existing grid, unchanged
│  [card] [card] [card]                                             │
└─────────────────────────────────────────────────────────────────┘
```

Field order, left to right: **Category, Location, Price min, Price max, Price unit ("per")**, then the **Apply filters** submit button. "Clear filters" renders as a plain text link (not a button) to the right of or below Apply, and — per §9 — only when at least one filter is currently active.

Container: `flex flex-wrap items-end gap-3 rounded-2xl border border-black/[.08] p-4 mb-6 dark:border-white/[.145]` — same border/rounded-corner/padding scale as existing cards (M3 §9), so it reads as "one more panel in this design system," not a new visual language. Each field is a labeled `<label className="flex flex-col gap-1 text-sm">` matching the label style already used in the listing create/edit form.

## 3. URL-param-driven filters

Filters are expressed as query-string params on `/listings` so every filtered view is a plain shareable/bookmarkable URL. Exact param names:

| Param | Type | Example | Notes |
|---|---|---|---|
| `category` | one of the 14 `LISTING_CATEGORIES` values, or absent | `category=power_tools` | Absent or unrecognized value = no category filter |
| `location` | free text (URL-encoded) | `location=etobicoke` | Absent or empty (after trim) = no location filter |
| `price_min` | decimal string | `price_min=10` | Absent, empty, non-numeric, or negative = no lower bound |
| `price_max` | decimal string | `price_max=50` | Same validation as `price_min` |
| `price_unit` | one of `hour` / `day` / `week` | `price_unit=day` | Only applied if `price_min` and/or `price_max` is also present and valid — see §6 |

Example full URL: `/listings?category=power_tools&location=etobicoke&price_min=10&price_max=50&price_unit=day`

### Reading params (server component)

`/listings` stays a server component. Its signature gains a `searchParams` prop, read the same way `/listings/[id]` already reads its own (awaited Promise, Next.js 16 pattern):

```ts
export default async function ListingsIndexPage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string;
    location?: string;
    price_min?: string;
    price_max?: string;
    price_unit?: string;
  }>;
}) {
  const params = await searchParams;
  // parse/validate params, build the Supabase query (see §4), render the
  // filter bar with `defaultValue`/`selected` set from `params` so the form
  // reflects the current URL on load (a GET form's browser-native round trip
  // already does this "for free" since the page fully re-renders from the URL).
  ...
}
```

No client-side state, no `useSearchParams`/`router.push` needed — the plain GET form is sufficient and keeps this page a pure server component, consistent with the rest of `/listings`'s existing implementation.

## 4. How filters combine — AND semantics

All active filters combine with **AND**, applied as additional `.eq()`/`.ilike()`/`.gte()`/`.lte()` chain calls on top of the existing base query (`status = 'published'`, ordered `created_at desc`, capped at `INDEX_LIMIT`). A listing must satisfy every active filter to appear in results — there is no OR-across-filters mode, and this is not exposed as a toggle.

Exact query-building logic (pseudocode, matches the existing supabase-js chaining style already in `apps/web/src/app/listings/page.tsx`):

```ts
let query = supabase
  .from("listings")
  .select("id, title, category, price_amount, price_unit, location")
  .eq("status", "published");

if (category && isValidCategory(category)) {
  query = query.eq("category", category);
}

const trimmedLocation = location?.trim();
if (trimmedLocation) {
  query = query.ilike("location", `%${trimmedLocation}%`);
}

const min = parseValidPrice(price_min); // undefined if absent/NaN/negative
const max = parseValidPrice(price_max);
if (min !== undefined || max !== undefined) {
  const unit = isValidPriceUnit(price_unit) ? price_unit : "day";
  query = query.eq("price_unit", unit);
  if (min !== undefined) query = query.gte("price_amount", min);
  if (max !== undefined) query = query.lte("price_amount", max);
  // if both present and min > max, swap them silently before applying —
  // treat as user error, not a hard validation failure.
}

query = query.order("created_at", { ascending: false }).limit(INDEX_LIMIT);
```

Unrecognized `category` or `price_unit` values (e.g. a hand-edited URL with a typo) are treated as if the param were absent — do not error the page, just ignore that filter.

## 5. Location filter matching — case-insensitive substring (`ILIKE`)

**Decision: `ILIKE '%<trimmed input>%'`** against `listings.location`, not exact match.

Since `location` is free text with no fixed format (`"Etobicoke, ON"`, `"North York"`, `"Mississauga, Ontario"` are all valid, unvalidated strings — same as `profiles.city`), an exact-match filter would almost never match anything a user actually types. A user typing "Etobicoke" must match a listing whose location is stored as "Etobicoke, ON". Case-insensitive substring matching is the simplest approach that satisfies that expectation without introducing geocoding, a city-autocomplete dataset, or structured address fields — all explicitly out of scope per M3's own location decision.

No trimming/normalization beyond a basic `.trim()` on the input before building the pattern (collapsing internal whitespace, stripping punctuation, etc. is not needed for MVP).

## 6. Price-unit cross-filtering — decision

**Decision: option (a) — the price range filter is unit-scoped, not normalized.** The UI presents it as "$ min – $ max **per** [hour / day / week]" (a `price_unit` `<select>`, default `day`, sitting immediately after the max-price input), and the query only ever compares `price_amount` values within a single `price_unit` at a time (`query.eq("price_unit", unit)` alongside the `gte`/`lte` bounds, per §4's pseudocode). A listing priced `$500/week` is simply not returned by a `$10–$50 per day` filter — it isn't converted, estimated, or force-compared; it's excluded because it's a different unit than the one being filtered on.

Justification (why (a) over normalizing to a common unit):
1. **Correctness without guesswork.** Normalizing (e.g. treating "day" as "week ÷ 7" or "hour × 8") requires picking an hours-per-day/days-per-week assumption that's arbitrary for tool rentals (a weekend generator rental isn't priced like `hourly × 24 × 7`) — any conversion factor is a made-up business rule with no basis in this MVP's data, and getting it wrong actively misleads a shopper about what they'll pay.
2. **Trivial to implement and reason about.** A single `WHERE price_unit = $unit AND price_amount BETWEEN $min AND $max` is a plain indexed-friendly equality + range query — no derived/computed column, no per-row arithmetic in the `WHERE` clause.
3. **Matches how the create-listing form already frames price** (`$X.XX` + a unit selector defaulting to `day`, per M3 §5.1) — a shopper filtering "the same way an owner priced" is a consistent mental model across the whole app, not a new concept.
4. **Cost of the tradeoff is low for MVP.** A shopper who wants to compare an hourly ladder rental against a weekly one can just re-run the filter with a different unit selected (one click) — a small amount of friction, acceptable for a fast/cheap MVP versus building and maintaining a conversion table.

Important implementation detail: `price_unit` filtering only takes effect when the shopper has entered a `price_min` and/or `price_max`. The `<select>` always has a value (browsers always submit a value for a populated `<select>` on form submit) — so the page must **not** apply a `price_unit` filter on its own if both price bounds are empty, or every default page load/browse-with-only-category-filter action would silently and incorrectly restrict results to `day`-priced listings. This is called out explicitly in §4's pseudocode (`if (min !== undefined || max !== undefined) { ...apply unit... }`).

## 7. Category filter UI — dropdown (`<select>`), not chips

**Decision: a single native `<select name="category">`**, first option `"All categories"` (value `""`, meaning no filter), followed by the 14 `LISTING_CATEGORIES` entries in the same fixed order as the create-listing form (M3 §2).

Justification: 14 options as a chip/pill row would wrap across 2–3 lines even on a wide desktop viewport and needs custom active/inactive visual states (background fill, border color change) that don't exist anywhere else in the app yet — a new component pattern. A `<select>` is a single-line field, requires zero new styling (it's the exact same form control, with the exact same options list, already built and styled for the create/edit listing form), and is fully keyboard/mobile-native. Consistent with the "no new component library, minimal custom components" MVP directive.

## 8. Empty-state copy — two distinct cases

There are now two different "nothing to show" situations on `/listings`, and they must render different copy:

| Case | Condition | Copy |
|---|---|---|
| **Platform-wide empty** (existing, from M3) | No filters are active in `searchParams` AND zero published listings exist at all | Unchanged from M3 §8: "No listings yet." + "Be the first to list a tool!" link (→ `/listings/new` if logged in, → `/signup` if logged out) |
| **Filtered empty** (new, M4) | At least one filter is active in `searchParams` AND the filtered query returns zero rows | "No tools match your filters." (heading/body text) + "Try adjusting your search." (subtext) + **"Clear filters"** link (→ `/listings`, no query string) |

"At least one filter is active" means: `searchParams` contains a non-empty, valid `category`, a non-empty (post-trim) `location`, or a valid `price_min`/`price_max`. (A lone `price_unit` param with no `price_min`/`price_max` does **not** count as an active filter, per §6's implementation detail — it has no effect on the query in that case.)

Suggested markup, reusing the exact empty-state container style already used for the M3 empty state (`rounded-2xl border ... py-16 text-center`):

```html
<div className="flex flex-col items-center gap-4 rounded-2xl border border-black/[.08] py-16 text-center dark:border-white/[.145]">
  <p className="text-foreground">No tools match your filters.</p>
  <p className="text-sm text-zinc-500 dark:text-zinc-400">Try adjusting your search.</p>
  <Link href="/listings" className="text-sm font-medium text-foreground underline">
    Clear filters
  </Link>
</div>
```

## 9. Clear/reset filters affordance

- A **"Clear filters"** text link (styled like other secondary text links in the app: `text-sm font-medium text-foreground underline`) appears in the filter bar itself (see §2's layout), positioned near the Apply button.
- It renders **only when at least one filter is active** (same "active filter" definition as §8) — when a visitor lands on bare `/listings` with no query string, there is nothing to clear, so the link is omitted entirely (not shown disabled/greyed — simplest conditional render).
- It links to plain `/listings` with no query string — a normal `<Link>`, not a form reset button (a full navigation is simplest and matches the GET-form-driven approach; no JS-driven "reset without navigating" needed).
- The same link/copy also appears inside the filtered-empty state (§8), so a shopper who filters into a dead end always has an obvious way out without hunting back up to the filter bar.

## 10. Database indexing — no new index needed for M4

**Decision: the existing `listings_status_created_at_idx` (on `(status, created_at desc)`) is sufficient for M4. No new migration/index is required.**

Reasoning:
- MVP catalog scale (a new GTA-focused marketplace, not an established one) means low hundreds to low thousands of listing rows for the foreseeable milestones, not the volume where sequential-scan filtering on top of an already-narrow index becomes a real latency problem.
- The base query still leads with `status = 'published'` and `order by created_at desc limit 60` — exactly what the existing index serves. The additional `category` equality, `location ILIKE`, and `price_amount`/`price_unit` range/equality clauses are then evaluated against that already-small candidate set (the `LIMIT 60` cap from M3 keeps the worst case bounded regardless).
- `location ILIKE '%...%'` (leading wildcard) specifically **cannot** use a plain btree index anyway — it would need a `pg_trgm` extension + `GIN`/`GIN`-trigram index to be indexed at all. Adding that infrastructure now, before there's any evidence of a real performance problem, is premature optimization for a "fast and cheap MVP" milestone whose explicit goal is filtering correctness, not query-plan tuning.
- If the catalog grows enough that this becomes measurably slow (a later milestone's concern, likely around M7/M9 polish/QA), the straightforward next step is a compound index such as `(status, category, created_at desc)` and/or enabling `pg_trgm` for location — noted here as a flag for a future engineer, not built now.

No backend migration is required for M4 beyond the query/filter logic itself.

## 11. Mobile responsiveness

The filter bar is web-only (per M3's own non-goal — Expo mobile is a separate later milestone), but must remain usable within a narrow browser viewport, consistent with the existing responsive card grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`):

- Container: `flex flex-col gap-3` on mobile, switching to `sm:flex-row sm:flex-wrap sm:items-end sm:gap-3` at the `sm` breakpoint — same breakpoint already used for the card grid, so the whole page's responsive behavior changes at one consistent width.
- Each field (`category`, `location`, `price_min`, `price_max`, `price_unit`) is full-width (`w-full`) on mobile, auto/fixed-width (`sm:w-auto`, with a sensible `sm:w-40`/`sm:w-24` per field) at `sm` and above.
- The price min/max/unit trio stays visually grouped as one row even on mobile (`flex gap-2 items-end` nested inside the stacked column) since splitting "$min – $max per unit" across separate full-width stacked rows would read as three unrelated fields rather than one price-range control.
- "Apply filters" button is full-width on mobile (`w-full sm:w-auto`), "Clear filters" link sits directly below/after it, also full width tap target on mobile.

## 12. Non-goals (explicit)

- **Keyword/full-text search** on `title`/`description` — deliberately excluded from M4, see §1. Not deferred to a specific numbered milestone; add later only if there's real product evidence it's needed.
- **Sorting controls** (e.g. "price low to high," "newest first" toggle) — `created_at desc` remains the only order; a sort dropdown is a separate small feature, not built here.
- **Location radius / geo-distance search** — `location` remains free-text substring matching only; no lat/lng, no PostGIS, no "within X km" control.
- **Saved searches / filter persistence across sessions** — filters live only in the URL for the current view; nothing is stored per-user.
- **Pagination changes** — the M3 `INDEX_LIMIT = 60` hard cap is unchanged; filtered result sets are still capped the same way, no "load more"/infinite scroll added in M4.
- **New DB indexes** — explicitly deferred, see §10.
- **Mobile (Expo) filter screens** — this spec covers `apps/web` only, per M3's own convention; a mobile-equivalent spec is written separately when M8 starts.

## 13. Copy reference (exact strings)

- Filter bar labels: "Category", "Location", "Min price", "Max price", "Per" (for the price-unit select)
- Category select placeholder/"no filter" option: "All categories"
- Location input placeholder: "e.g. Etobicoke" (shorter than the create form's "e.g. Etobicoke, ON" since this is substring-matched, not a full value)
- Price min input placeholder: "Min $"
- Price max input placeholder: "Max $"
- Apply button: "Apply filters"
- Clear filters link: "Clear filters"
- Filtered-empty heading: "No tools match your filters."
- Filtered-empty subtext: "Try adjusting your search."
- Platform-wide empty state: unchanged from M3 — "No listings yet." / "Be the first to list a tool!"

## 14. Styling notes

- Same visual language as M2/M3: plain Tailwind utility classes, no component library, no new dependency for filter UI (native `<select>`/`<input>` elements only).
- Filter bar panel reuses the exact card border/rounded-corner scale (`rounded-2xl border border-black/[.08] dark:border-white/[.145]`) already established for cards and empty-state containers.
- Field labels: `text-sm` matching the create/edit listing form's label style; inputs/selects reuse the same border/padding/rounded classes as those form fields (no new input style invented for this page).
- "Apply filters": primary-style button matching existing primary buttons in the app (e.g. "Publish listing" / "Save changes" styling — solid background, white text).
- "Clear filters": secondary text link style — `text-sm font-medium text-foreground underline`, matching "Edit listing" and other secondary links already in the app.
- Filtered-empty and platform-empty states share the same container styling (§8) so switching between the two states doesn't visually jar.

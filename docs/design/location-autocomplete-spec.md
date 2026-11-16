# M19 — Location Autocomplete (Browse Filter + Listing Form)

Status: ready for implementation
Scope: `apps/web` only — one new reusable Client Component, one new server-side
proxy (Server Action, not a Route Handler — see §4), a small addition to
`apps/web/src/lib/listings/geocode.ts`, and two call-site wiring changes
(`apps/web/src/app/listings/page.tsx`'s filter form, and
`apps/web/src/components/listings/ListingForm.tsx`'s location field). No
mobile/Expo changes — same boundary M5/M15/M17/M18 all held ("a
mobile-equivalent spec is written separately when/if mobile picks this up").
No payment/account/billing dependency: this reuses the same OSM Nominatim
instance M17 already calls (free, no API key, same `User-Agent` convention) —
nothing in this spec requires Max to create any account or spend any money.

## 0. Why, and why this shape

Max flagged that both Location fields (`/listings`'s filter and the listing
create/edit form) are plain free-text inputs with zero in-app suggestions. Two
distinct motivations, both satisfied by the same component:

1. **Shopper-facing UX** on the browse filter — typing a recognized place name
   as you type is a conventional, expected pattern on any marketplace with a
   location filter.
2. **Data-quality leverage** on the listing form — M17's `geocodeLocation`
   (`apps/web/src/lib/listings/geocode.ts`) already turns whatever free text an
   owner typed into a Nominatim `/search` query biased to Ontario/Canada. If
   the owner is nudged toward picking an actual Nominatim-recognized place name
   while typing, that same downstream geocode call (unchanged, still fires at
   create/edit time per M17 §3.3) is far more likely to resolve correctly on
   the first try. This spec does **not** touch `geocodeLocation` itself, its
   cache, or its single-result contract — it adds a sibling, multi-result
   *suggestions* query (§5) that only ever feeds the input's displayed text.

**One component, not two**, because the underlying need (type free text, see
ranked place-name matches, optionally pick one, the raw text always remains a
valid submittable value) is identical on both pages — the only difference is
the kind of `<form>` it lives inside (§2.3), which the component is designed
to be agnostic to.

**The hard constraint shaping almost every decision below: Nominatim's usage
policy.** It requires a real, descriptive `User-Agent` (already satisfied,
`geocode.ts` sets one), caps sustained use at roughly 1 request/second, and
explicitly prohibits "autocomplete search that sends a new request on every
keystroke." This is not a style preference — M17's listing-detail map and
M18's browse-page map view both depend on this same public instance staying
unblocked. A naive per-keystroke autocomplete would be the single most likely
thing in this codebase to get RentalTool's `User-Agent` rate-limited or banned
outright, breaking three features at once (this one, M17, M18). §3 mandates
debounce + minimum query length for exactly this reason, as a hard requirement.

## 1. Scope

**In scope:**
- One new Client Component, `LocationAutocompleteField` (§2), used by both
  `/listings`'s filter bar and `ListingForm`'s location field.
- One new server-side proxy Server Action, `getLocationSuggestions` (§4), that
  is the *only* thing in this app allowed to call Nominatim's `/search`
  endpoint for multi-result suggestions.
- One new addition to `geocode.ts`: `searchLocationSuggestions` (§5), a plain
  helper (not itself `"use server"`, same convention as `geocodeLocation`),
  reusing the same `User-Agent`, timeout, and Ontario/Canada query-biasing
  `geocodeLocation` already uses, but requesting `limit=5` ranked results
  instead of `limit=1`.
- A real ARIA combobox interaction pattern (§6): keyboard navigation, screen
  reader wiring, mobile touch targets.
- Graceful degradation (§8): free-typing an unlisted value and submitting it
  keeps working exactly as today, on both pages, in every failure mode.

**Explicitly out of scope / deferred:**
- Any change to `geocodeLocation`'s own contract, its single-result query, or
  `geocode_cache` (M17 §2/§3) — untouched. This spec's suggestions query is
  deliberately uncached (§5) and lives entirely separately.
- Capturing lat/lng directly from a selected suggestion on the listing form
  and skipping `geocodeLocation`'s own create/edit-time call — considered and
  **deferred**, not recommended for this pass. See §9 for the full reasoning.
- Any change to `/listings`'s `ilike("location", ...)` filter query itself
  (M4 §5) — the filter still substring-matches whatever text ends up in the
  field, selected-from-a-suggestion or hand-typed, identically.
- Autocomplete on any field other than `location` (e.g. no address/category
  autocomplete — not asked for, not added).
- Mobile (Expo) — not covered, same boundary as every prior location-feature
  spec in this repo.

## 2. The reusable component — `LocationAutocompleteField`

New file: `apps/web/src/components/listings/LocationAutocompleteField.tsx`,
`"use client"`.

### 2.1 Props / API

```ts
export type LocationSuggestion = {
  /** Display text AND the exact value written into the input on selection —
   * single source of truth, no separate "short label" vs "submitted value"
   * to keep in sync. See §5 for how this string is derived from Nominatim's
   * `display_name`. */
  label: string;
  lat: number;
  lng: number;
};

export type LocationAutocompleteFieldProps = {
  /** Element id, also used to derive every aria-* id below (`${id}-listbox`,
   * `${id}-option-${i}`). Caller supplies it so the existing <label
   * htmlFor="location"> on ListingForm, and any future <label> on the filter
   * bar, keep working exactly as a normal labeled input. */
  id: string;
  /** Form field name — both call sites pass "location" today; kept as a prop
   * (not hardcoded) so the component has no implicit knowledge of either
   * page's form shape. */
  name: string;
  /** Initial text value. On the filter bar this is `params.location ?? ""`
   * (GET-form round trip, exactly like every other filter field's
   * `defaultValue` today); on ListingForm it's `values.location`. */
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  /** Optional override; defaults to this app's standard input treatment
   * (design-system.md §4.5 — the same `inputClassName` constant
   * `/listings/page.tsx` and `ListingForm.tsx` already each define locally).
   * Exposed so neither call site needs a copy/paste fork if one page ever
   * needs a narrower width class, same way other fields on the filter bar
   * already vary width via wrapper classes, not input classes. */
  inputClassName?: string;
  /** Called when the user picks a suggestion (click or Enter-on-highlighted).
   * Not wired to anything in either call site today — the component always
   * updates its own text value regardless of whether this is passed. Kept
   * optional/available now specifically so the deferred lat/lng-capture
   * idea (§9) could be wired in later without reshaping this component's
   * API — not used in this pass. */
  onSelect?: (suggestion: LocationSuggestion) => void;
};
```

### 2.2 Internal state machine (implementable as written)

```ts
const [value, setValue] = useState(defaultValue ?? "");
const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
const [status, setStatus] = useState<"idle" | "loading" | "results" | "no-results" | "error">("idle");
const [isOpen, setIsOpen] = useState(false);
const [highlightedIndex, setHighlightedIndex] = useState(-1);

const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
// Monotonically increasing per call — not an AbortController (§4.3 explains
// why a Server Action can't be truly client-aborted); the component instead
// discards any resolved response whose sequence number isn't the latest.
const requestSeq = useRef(0);
```

- The `<input>` is **controlled** (`value={value}`), not uncontrolled, so the
  component can rewrite its own text on selection — but it still renders a
  plain `name={name}` attribute, so native `FormData`/GET-form serialization
  picks it up with zero special-casing on either call site (§2.3). This is
  exactly how every other field on both forms already works (controlled React
  state + a plain `name` attribute is already `ListingForm`'s pattern for its
  other fields); nothing new is introduced at the form-submission layer.
- `onChange`: update `value` immediately (so typing never feels laggy),
  clear any pending `debounceTimer`, and — only if the trimmed value is **3+
  characters** (§3) — schedule a new debounced fetch. If the trimmed value
  drops below 3 characters, clear `suggestions`, set `status` to `"idle"`,
  and close the dropdown; never fire a request for a 0–2 character query.
- Debounced fetch (fires **400ms** after the user stops typing — see §3 for
  why this exact window): increment `requestSeq.current`, capture
  `const seq = requestSeq.current`, set `status = "loading"`, call
  `getLocationSuggestions(trimmedValue)` (§4), and on resolution: if
  `seq !== requestSeq.current` (a newer keystroke already superseded this
  call), **discard the result silently** — do not update state at all. Only
  the latest in-flight request's result is ever applied ("last wins").
- On success with `results.length > 0`: `setSuggestions(results)`,
  `status = "results"`, `isOpen = true`, `highlightedIndex = -1` (nothing
  pre-highlighted — first ArrowDown highlights index 0).
- On success with zero results: `setSuggestions([])`, `status = "no-results"`,
  `isOpen = true` (so the subtle "no matches" affordance in §8 can render),
  `highlightedIndex = -1`.
- On the Server Action throwing/rejecting (network hiccup, unexpected error):
  caught locally, `status = "error"`, `suggestions = []`, `isOpen` stays as-is
  — never a blocking error, never a toast; §8 covers the exact rendered state.
- Selecting a suggestion (click on an option, or Enter while
  `highlightedIndex >= 0`): `setValue(suggestion.label)`, close the dropdown
  (`isOpen = false`, `highlightedIndex = -1`), call `onSelect?.(suggestion)`,
  return focus to the input. Does **not** submit the form itself — same as
  every other field on both pages, submission is still the user's own
  "Apply filters" / listing-form submit action.
- Blur (focus leaves the input and the dropdown isn't what received it):
  close the dropdown, keep whatever text is currently typed exactly as-is —
  never reverts, never clears, never force-matches to a suggestion.

### 2.3 The two integration call sites

**`/listings` filter bar (`apps/web/src/app/listings/page.tsx`)** — stays a
Server Component, stays a plain `method="GET" action="/listings"` form, zero
other client JS on the page today. Swap the existing
```tsx
<input type="text" name="location" defaultValue={params.location ?? ""} placeholder="e.g. Etobicoke" className={inputClassName} />
```
for
```tsx
<LocationAutocompleteField
  id="location-filter"
  name="location"
  label="Location"
  defaultValue={params.location ?? ""}
  placeholder="e.g. Etobicoke"
/>
```
A Server Component may statically import and render a Client Component with no
special handling (exactly the precedent M17 §5.2/M18 §10.3 already
established for `ListingLocationMapLoader`/`ListingsMapViewLoader`) — **the
difference here is this component does not need their `next/dynamic({ ssr:
false })` wrapper at all**, because unlike Leaflet it never touches
`window`/`document` at module-evaluation time; it's an ordinary client
component that server-renders its initial markup (the input with its
`defaultValue`) and hydrates normally. Don't reflexively copy the Leaflet
SSR-split pattern here — it would be unnecessary extra files for a problem
this component doesn't have.
The surrounding `<form>` is untouched: pressing Enter with no suggestion
highlighted, or clicking "Apply filters", submits the native GET form exactly
as today, carrying whichever text is currently in the (now React-controlled,
but still plain-`name`-attributed) input.

**`ListingForm.tsx`** — already a Client Component, already collects its own
`FormData` from the DOM on submit (via `formRef`) to call `createListing`/
`updateListing`. Swap the existing
```tsx
<input id="location" name="location" type="text" required defaultValue={values.location} placeholder="e.g. Etobicoke, ON" className="..." />
```
for
```tsx
<LocationAutocompleteField
  id="location"
  name="location"
  label="Location"
  defaultValue={values.location}
  placeholder="e.g. Etobicoke, ON"
  required
/>
```
(the existing `<label htmlFor="location">Location</label>` stays exactly as
it is today — note `LocationAutocompleteField` takes its own `label` prop
too, but a call site that already renders its own `<label>` like `ListingForm`
does can keep doing so and simply not render the component's internal label,
or the component can accept an optional `hideLabel` flag — implementer's
call, not worth pinning further). Since `ListingForm` reads the location value
out of `new FormData(formRef.current)` at submit time exactly like every
other field, and the rendered `<input name="location">` still carries
whatever text is currently in it (selected-from-suggestion or hand-typed),
**no change is needed to `ListingForm`'s own submit handler or to
`parseListingFields`/`actions.ts`** — this is a pure drop-in replacement of
one input element for a form-compatible one.

## 3. Debounce + rate-limit approach

**Mandated, not optional, per Nominatim's usage policy (§0):**

| Rule | Value | Why |
|---|---|---|
| Debounce after last keystroke | 400ms | Comfortably inside the policy's 300–500ms-class guidance for "wait until the user pauses" — short enough to feel responsive, long enough that a normal typing cadence (multiple keystrokes per second) never generates more than roughly one request per pause, nowhere close to the ~1 req/sec ceiling even under fast typing. |
| Minimum query length before firing any request | 3 characters (trimmed) | A 1–2 character query against a worldwide place-name dataset filtered only by `countrycodes=ca` returns too many irrelevant matches to be useful, and is exactly the kind of "fire on every keystroke from the very first character" behavior the policy calls out — guarding it at 3 characters cuts the request volume further for free. |
| In-flight request cancellation on next keystroke | "Last wins" via sequence number (§2.2), not a true abort | See §4.3 — a Server Action's server-side work can't be aborted by the client the way a Route Handler's `fetch` could via `request.signal`; discarding stale results achieves the same UX goal (never show/act on an outdated response) without needing true abort. |
| Client never calls Nominatim directly | Always true — see §4 | Keeps the `User-Agent` header and rate-limit-relevant logic server-side where it's actually enforceable, not merely trusted to client code a browser extension or modified request could bypass. |

Why this matters beyond "being a good citizen": M17's listing-detail map and
M18's browse-page map view both already depend on tiles/geocoding from this
same effectively-shared public resource (Nominatim for geocoding; OSM for map
tiles). Getting this app's `User-Agent` rate-limited for hammering
`/search` on every keystroke would degrade or break those two already-shipped
features too, not just this one — this is a shared-resource constraint, not
a per-feature one.

## 4. Server-side proxy — Server Action, not a Route Handler

**Decision: a Server Action, `getLocationSuggestions`, called directly as an
async function from `LocationAutocompleteField`'s client code — not a Route
Handler.**

### 4.1 Why

This repo has **zero** Route Handlers anywhere under `apps/web/src/app` today
— every interactive/mutating path is a `"use server"` Server Action (M2
through M18 all followed this, e.g. `apps/web/src/app/listings/actions.ts`).
`ListingForm.tsx` already establishes the exact precedent this spec needs:
it's a Client Component that directly imports and calls Server Actions
(`createListing`, `updateListing`) as plain async functions from its own
event handlers — **not** exclusively via a `<form action={...}>` wiring. This
same pattern — a Client Component importing and `await`-calling a `"use
server"` function from a debounced `useEffect`/timeout callback — is all this
feature needs, with no new architectural surface for the team to learn or for
code review to reason about.

The one real advantage a Route Handler would have is **true server-side fetch
abortion**: a Route Handler can receive the client's `AbortController` signal
over the HTTP request and plumb it into its own outbound `fetch(...,
{ signal })` to Nominatim, actually cancelling the outbound network call when
the client gives up on it. A Server Action, invoked as React's server-action
RPC, has no equivalent client-to-server abort wiring in this Next.js version —
once called, it runs to completion server-side regardless of what the client
decides to do with the result.

**That gap doesn't matter enough here to justify the inconsistency.** §3's
debounce (400ms) plus the 3-character minimum already keeps real request
volume low — this is not a "cannot do without abort" situation, it's "abort
would be a nice-to-have." The sequence-number "last wins" pattern (§2.2/§4.3)
fully satisfies the actual UX requirement (never show or act on a stale
response) without it. If a future pass finds Nominatim rate-limiting becomes
a real problem in practice despite debounce + minimum length — e.g. a bursty
usage pattern this spec didn't anticipate — **that** would be the trigger to
revisit with a Route Handler, not a preemptive build now.

### 4.2 New files

`apps/web/src/lib/listings/geocode.ts` — add (does not modify existing
exports):

```ts
export type LocationSuggestionResult = { label: string; lat: number; lng: number };

export async function searchLocationSuggestions(
  queryText: string,
  limit = 5,
): Promise<LocationSuggestionResult[]> {
  const trimmed = queryText.trim();
  if (trimmed.length < 3) return []; // defense in depth — never trust only the client's own 3-char gate (§3) for the call that actually costs a Nominatim request
  // ... same User-Agent, 5s AbortController timeout, countrycodes=ca +
  // ", Ontario, Canada" query-string biasing as geocodeLocation (§0) — but
  // &limit=${limit} instead of &limit=1, and mapping every array element to
  // { label, lat, lng } (§5) instead of taking only body[0].
  // Never throws — same convention as geocodeLocation: any non-200,
  // timeout, network error, or empty body resolves to [], logged via
  // console.error, never surfaced as a thrown error.
}
```

New file, `apps/web/src/app/listings/locationSuggestions.ts`, `"use server"`
— deliberately **separate from** `apps/web/src/app/listings/actions.ts`
(which stays focused on listing CRUD mutations; this is an unrelated
read-only helper, same reasoning as why `geocode.ts` itself is its own file
rather than folded into `categories.ts`):

```ts
"use server";

import { searchLocationSuggestions } from "@/lib/listings/geocode";
import type { LocationSuggestion } from "@/components/listings/LocationAutocompleteField";

export async function getLocationSuggestions(query: string): Promise<LocationSuggestion[]> {
  const results = await searchLocationSuggestions(query, 5);
  return results; // shape is already { label, lat, lng } — no supabase/cache involvement, unlike geocodeLocation (§5 explains why no cache here)
}
```

### 4.3 "Last wins" staleness handling (restated from §2.2 for completeness)

Because there is no true abort, the contract that actually matters is: the
component must **never apply a resolved result that isn't the most recent
call it made**. The `requestSeq` ref pattern in §2.2 is the entire mechanism —
no additional server-side bookkeeping is needed (the Server Action itself is
stateless per call; staleness is purely a client-side concern about which
response to act on).

## 5. Query shape, Ontario/Canada scoping, and the suggestion label

`searchLocationSuggestions` reuses `geocodeLocation`'s exact scoping approach:

```
GET https://nominatim.openstreetmap.org/search
  ?format=json
  &limit=5
  &countrycodes=ca
  &q=<queryText>, Ontario, Canada
```
with the same `User-Agent: RentalTool-GTA/1.0 (https://rental-tool-web.vercel.app)`
header and 5-second `AbortController` timeout `geocode.ts` already uses. The
only differences from `geocodeLocation`'s own request: `limit=5` instead of
`limit=1`, and every element of the response array is mapped (not just
`body[0]`).

**Label derivation:** Nominatim's `display_name` for a Canadian locality is
typically a long comma-separated string (e.g. `"Etobicoke, Toronto, Golden
Horseshoe, Ontario, M9A, Canada"`). Showing that full string in a small
dropdown row is noisy, and it's more than `geocodeLocation`'s own downstream
query needs (which already appends `, Ontario, Canada` itself). **Decision:
take the first two comma-separated segments** (e.g. `"Etobicoke, Toronto"`)
as both the dropdown row's display text and the exact string written into the
input on selection — one value, not a "short label" vs. "submitted value"
pair to keep in sync. This is deliberately a short, readable, still-precise-
enough string that `geocodeLocation`'s own single-result query (appending
`, Ontario, Canada`) will reliably re-resolve later at create/edit time — the
entire point of this feature's data-quality motivation (§0).

**No caching for suggestions**, unlike `geocodeLocation`'s `geocode_cache`
table. Reasoning: `geocode_cache` caches a normalized *final* location string
(exactly what a listing saves with) — a small, naturally-repeating keyspace
(many listings cluster in a handful of GTA neighborhoods). Autocomplete
queries are prefix fragments of whatever a user is mid-typing ("e", "et",
"eto", "etob", ...) — a much larger, much less repeating keyspace where a
cache would mostly miss, adding complexity (a second table, or awkward
prefix-matching logic) for little real hit rate. The debounce + 3-char
minimum (§3) is the right lever for this path's request volume, not caching.

## 6. ARIA combobox UI — markup, keyboard, mobile

Must be a real ARIA combobox pattern, not a mouse-only styled list:

```tsx
<div className="relative">
  <label htmlFor={id} className="text-sm font-medium text-foreground">{label}</label>
  <input
    id={id}
    name={name}
    type="text"
    role="combobox"
    aria-expanded={isOpen}
    aria-controls={`${id}-listbox`}
    aria-autocomplete="list"
    aria-activedescendant={highlightedIndex >= 0 ? `${id}-option-${highlightedIndex}` : undefined}
    autoComplete="off"
    value={value}
    onChange={...}
    onKeyDown={...}
    onBlur={...}
    className={inputClassName ?? DEFAULT_INPUT_CLASSNAME}
  />
  {isOpen && (
    <ul
      id={`${id}-listbox`}
      role="listbox"
      className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-lg border border-line bg-surface shadow-md"
    >
      {status === "results" &&
        suggestions.map((s, i) => (
          <li
            key={`${s.lat},${s.lng}`}
            id={`${id}-option-${i}`}
            role="option"
            aria-selected={i === highlightedIndex}
            onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}
            onMouseEnter={() => setHighlightedIndex(i)}
            className={`flex min-h-11 items-center px-3 py-2 text-sm cursor-pointer ${
              i === highlightedIndex ? "bg-primary/10 text-foreground" : "text-foreground"
            }`}
          >
            {s.label}
          </li>
        ))}
      {status === "no-results" && (
        <li className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400" aria-live="polite">
          No matches — you can still use what you typed.
        </li>
      )}
    </ul>
  )}
</div>
```

Notes:
- `onMouseDown` + `preventDefault()` on each option (not `onClick`) is
  deliberate — `onClick` would fire after the input's own `onBlur`, which
  would already have closed the dropdown; `onMouseDown` fires first and lets
  selection happen before blur closes anything.
- `autoComplete="off"` suppresses the browser's own native autofill dropdown,
  which would otherwise visually collide with this component's own listbox.
- **Keyboard handling (`onKeyDown`):**
  - `ArrowDown` — if closed and `suggestions.length > 0`, open it; otherwise
    move `highlightedIndex` forward, clamped at `suggestions.length - 1` (no
    wraparound — simplest, standard enough for a 5-item list).
  - `ArrowUp` — move `highlightedIndex` back, clamped at `-1` (meaning
    "nothing highlighted, back to the raw typed text").
  - `Enter` — **only** `preventDefault()` (blocking the native form submit)
    when `isOpen && highlightedIndex >= 0`: select that suggestion. In every
    other case (closed dropdown, or open with nothing highlighted), let the
    native `Enter` behavior proceed — on the GET filter form this is what
    submits the search exactly like today; on `ListingForm` this is caught
    by its own existing submit handling. This is the one subtlety that
    makes the component safe to drop into a plain GET form with no JS
    submit handler at all.
  - `Escape` — if open, close the dropdown and clear `highlightedIndex`
    (does **not** clear the typed text). If already closed, let `Escape`
    do nothing special (no need to blur/clear).
  - `Tab` — no special handling; default browser focus-advance behavior is
    preserved, and the dropdown closes via the resulting `onBlur`.
- **Touch targets:** each `<li role="option">` is `min-h-11` (44px, this
  app's established full-page-submit touch-target tier, design-system.md
  §4.1/M18 §10.5) — comfortably tappable on phone width, this app's primary
  usage context per every prior QA/design pass.
- **Mobile dropdown positioning:** `absolute left-0 right-0 top-full` keeps
  the listbox pinned directly under the input at full input width on any
  viewport, `max-h-60 overflow-y-auto` caps it at a scrollable ~240px so it
  never grows tall enough to push the rest of a small phone screen
  off-view — a user can still scroll the 5-row list internally without the
  page itself jumping. `z-20` keeps it above the card grid/filter panel
  below it, consistent with this app's existing (if sparse) z-index usage.
- **iOS Safari auto-zoom:** the input's font size must be `text-sm` (14px)
  **only if** paired with `text-base` fallback — actually: this app's
  existing `inputClassName` is already `text-sm`, which is below the 16px
  threshold that triggers iOS Safari's auto-zoom-on-focus. This is a
  pre-existing condition on every input in the app today, not introduced by
  this spec, so it's flagged here only as a known note, not fixed as part of
  this pass (fixing it app-wide is a design-system-level change outside this
  spec's scope — out of scope, not deferred-and-forgotten, just not this
  ticket's job).

## 7. Visual styling — on-brand tokens, nothing new invented

Reuses exactly the tokens/classes already established:
- Input: same `inputClassName` shape both call sites already define locally
  (`design-system.md` §4.5) — `rounded-lg border border-line bg-transparent
  px-3 py-2 text-sm text-foreground placeholder:text-zinc-400 outline-none
  focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20`.
  No new input treatment.
- Dropdown panel: `rounded-lg border border-line bg-surface shadow-md` — the
  same card-shell language (§4.6 of design-system.md) used everywhere else
  a bordered panel floats above content, just with `shadow-md` added since
  this one visually floats over other page content rather than sitting
  inline.
- Highlighted/active option: `bg-primary/10` (a 10%-opacity wash of the
  primary orange `#c2410c`/`#f97316`) — distinguishable without introducing
  a new color, consistent with how `aria-selected`/active states elsewhere in
  this app (e.g. the M18 list/map toggle's active pill) use the primary
  color to mean "currently selected."
- "No matches" row: `text-xs text-zinc-500 dark:text-zinc-400` — the app's
  existing meta/small-text tier (design-system.md §2.2), signaling
  "informational, not an error," never styled with `--danger`.
- No new color, spacing, or radius value is introduced anywhere in this
  component — every class used above already exists in the design system.

## 8. Graceful degradation

No matches, request failure/timeout, or simply not picking a suggestion must
**never** block typing or submitting, on either page:

| Situation | Behavior |
|---|---|
| User never opens/interacts with the dropdown at all | Identical to today — plain typed text sits in the input, submits as a normal field, nothing about this feature is even invoked beyond the (harmless, debounced) suggestion fetch. |
| Query returns zero matches | Dropdown opens showing the subtle "No matches — you can still use what you typed." row (§6) — not an error state, not a blocking modal, just an informational affordance. The input keeps whatever text the user typed, fully submittable. |
| `getLocationSuggestions` throws / Nominatim times out / network error | Caught in the component (§2.2's `status = "error"` branch); render **nothing extra** — no error banner, no toast, the dropdown simply doesn't open for that attempt (or stays showing whichever last-good suggestions it already had, if any — either is acceptable, see §10). The typed text is completely unaffected and remains submittable exactly as if the feature didn't exist. |
| User picks a suggestion, then keeps typing/edits the text afterward | No special handling — editing after a selection is just normal typing; the field re-triggers the normal debounce/suggest flow for whatever the new text is. The previously-selected suggestion's `lat`/`lng` (if ever used per §9) would need its own staleness invalidation — moot for this pass since §9 defers that capture entirely. |
| User submits with a value that doesn't match any suggestion ever shown | Submits normally on both pages — the filter's `ilike` match (M4 §5) and `ListingForm`'s `parseListingFields`/`geocodeLocation` call (M17 §3.1/§3.3) are both completely unaware of whether the submitted text came from a suggestion or free typing, and neither needs to be. |

## 9. Lat/lng capture from a selected suggestion — deferred, not built

The task considered also capturing `lat`/`lng` directly from a selected
Nominatim suggestion on the listing form, skipping `geocodeLocation`'s own
call for that listing. **Recommendation: defer this. `ListingForm`'s location
field stays pure input-UX in this pass — `geocodeLocation`'s own create/edit-
time call (M17 §3.3) remains the only place `lat`/`lng` ever gets set.**

Why this doesn't "fit cleanly" enough to build now:

1. **New trust boundary in `actions.ts`.** Today, `createListing`/
   `updateListing` derive `lat`/`lng` exclusively from a server-side geocode
   call on already-validated text — the client never supplies coordinates
   directly. Accepting client-submitted `lat`/`lng` would mean
   `parseListingFields` growing two new optional numeric fields *and*
   `actions.ts` growing conditional logic ("trust the submitted lat/lng if
   present, otherwise fall back to `geocodeForListing`") — a real change to
   a currently simple, single-path trusted flow, not a drop-in addition.
2. **Staleness/spoofing risk that needs its own handling.** A selected
   suggestion's `lat`/`lng` is only valid for the exact `label` text it came
   with. If the user picks a suggestion and then edits the text afterward
   (§8's table, last row) without re-selecting, a naively-wired hidden field
   would submit stale (or, if a user hand-crafts the request, arbitrary)
   coordinates attached to different text than what they actually represent.
   Handling this correctly needs either clearing the hidden fields on any
   edit after selection, or re-validating server-side that the submitted
   text still matches the submitted coordinates closely enough to trust —
   either way, more logic than "add two hidden inputs."
3. **The win is small.** `geocodeLocation`'s own call is already fast, free,
   cached for repeat location strings, and fails open (M17 §3.4) — skipping
   it for listings created via a suggestion pick saves roughly one cheap,
   already-reliable server call per listing creation/edit, not a meaningful
   cost or latency problem today.

If a future pass wants this optimization, the clean way to build it is a
small, explicit addition to `actions.ts`'s existing create/edit flow (new
optional `lat`/`lng` form fields, validated and only trusted when paired with
exact-text-match confirmation against the submitted `location` string) — not
something this spec bundles in now. `onSelect` (§2.1) is kept on the
component's API specifically so that future work wouldn't need to reshape
`LocationAutocompleteField` itself when it happens.

## 10. Non-goals (explicit)

- **No change to `geocodeLocation`, `geocode_cache`, or the privacy-jitter
  model (M17 §4)** — this spec adds a sibling multi-result query, never
  touches the single-result create/edit-time path.
- **No change to `/listings`'s `ilike` substring-match query (M4 §5)** — the
  filter still matches whatever text is in the field, unchanged.
- **No lat/lng capture on the listing form in this pass** — see §9.
- **No Route Handler added** — see §4's decision.
- **No caching of suggestion queries** — see §5.
- **No new DB migration/table** — this is a pure UI + server-proxy feature;
  nothing persists beyond what M17 already persists (`lat`/`lng` on
  `listings`, unaffected cache table).
- **Mobile (Expo)** — not covered, same boundary as every prior spec.
- **No app-wide 16px-input-font fix for iOS Safari auto-zoom** — noted as a
  pre-existing condition (§6), not this ticket's scope.

## 11. Copy reference (exact strings)

- "No matches" row: "No matches — you can still use what you typed."
- No other new user-facing copy — both fields keep their existing labels
  ("Location") and placeholders ("e.g. Etobicoke" on the filter, "e.g.
  Etobicoke, ON" on the listing form), unchanged by this spec.

## 12. Review checklist callouts (for code-reviewer)

- Confirm `searchLocationSuggestions` and `getLocationSuggestions` never
  throw — every failure mode (timeout, non-200, network error, empty body)
  resolves to `[]`, logged via `console.error`, same convention as
  `geocodeLocation` (M17 §3.1 point 4).
- Confirm `locationSuggestions.ts` only exports async functions (it's `"use
  server"`) and confirm this change doesn't touch `actions.ts` at all —
  this is a deliberately separate file (§4.2).
- Confirm the 3-character minimum is enforced **twice**: once client-side in
  `LocationAutocompleteField` (so no request is even attempted) and once
  server-side in `searchLocationSuggestions` (defense in depth — never trust
  a client-only gate for the call that actually costs a Nominatim request).
- Confirm the `requestSeq`/"last wins" staleness check is actually present
  and correctly discards out-of-order resolutions — a slow early request
  resolving after a faster later one must never overwrite the later one's
  (possibly empty) result.
- Confirm `Enter` only `preventDefault()`s when `isOpen && highlightedIndex
  >= 0` — this is the detail that keeps the component safe to drop into
  `/listings`'s plain GET form with zero other JS; getting this wrong would
  either block normal form submission or silently select a suggestion the
  user didn't intend to pick.
- Confirm `LocationAutocompleteField` is rendered directly by the Server
  Component `page.tsx` with **no** `next/dynamic({ ssr: false })` wrapper —
  unlike the M17/M18 Leaflet components, this one has no SSR hazard, and
  adding an unnecessary dynamic-import split would just be extra files.
- Confirm neither call site's native `name="location"` attribute was
  accidentally dropped or renamed during the swap — `parseListingFields`
  (listing form) and the `/listings` query's `params.location` read both
  depend on that exact field name being present in the submitted
  `FormData`/query string.
- No UTC-vs-Toronto timezone concern applies (no dates involved) — listed
  per the standing checklist, not because this spec introduces date handling.

## 13. Left to engineer judgment

- Exact debounce value within the 300–500ms policy-guided range (§3 proposes
  400ms as a reasonable midpoint) — not worth debating further.
- Whether `LocationAutocompleteField` renders its own `<label>` or accepts a
  `hideLabel` flag for call sites (like `ListingForm`) that already render
  their own — either is fine (§2.3), implementer's call.
- Exact wording tweaks to the "No matches" copy — the given string (§11) is a
  reasonable default, not a value worth debating further.
- Whether `DEFAULT_INPUT_CLASSNAME` lives as a local constant inside
  `LocationAutocompleteField.tsx` or is imported from a shared location —
  given both call sites already define their own local `inputClassName`
  today with identical values, a local constant inside the new component is
  simplest; no need to create a new shared module for one string.
- Minor visual/spacing details not pinned above — implementer's normal
  judgment, consistent with every prior spec's closing note.

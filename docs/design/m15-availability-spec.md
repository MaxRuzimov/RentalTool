# M15 — Availability Blocking on the Request-to-Rent UI

Status: ready for implementation
Scope: `apps/web` only (`components/bookings/RequestToRentForm.tsx`, `app/listings/[id]/page.tsx`, a new Postgres function). No mobile/Expo changes — same boundary M5 held ("a mobile-equivalent spec is written separately when M8 starts"); this spec doesn't touch that boundary either.
Non-goals: a listing-wide "unavailable" status change, a visual calendar-grid widget, any change to `pending`/`declined`/`cancelled` blocking semantics, any change to the two existing server-side double-booking checkpoints. See §8 for the full list.

## 0. Assumptions / what this builds on, unchanged

- M5 (`docs/design/m5-booking-spec.md` §4) and M14 already enforce double-booking prevention at two application-level checkpoints — request creation and owner approval — via `public.booking_has_approved_overlap(p_listing_id, p_start_date, p_end_date, p_exclude_booking_id)` in `supabase/migrations/00000000000004_bookings.sql`. **This spec does not change that function, its checkpoints, or its semantics in any way.** M15 is purely an additive UX layer: surface the same "approved bookings block dates" fact to the renter *before* they submit, instead of only after.
- Only `status = 'approved'` bookings block a date range. `pending`, `declined`, and `cancelled` bookings never block anything — same as M5 §4, unchanged, not re-litigated here.
- `RequestToRentForm.tsx` (`apps/web/src/components/bookings/RequestToRentForm.tsx`), rendered from `apps/web/src/app/listings/[id]/page.tsx`, and `apps/web/src/lib/bookings/pricing.ts`'s `dayCount`/`todayISODate`/`formatDateRange` helpers are read in full and reused as-is — no changes to their TZ-safety approach (`todayISODate()`'s America/Toronto `Intl.DateTimeFormat`, `YYYY-MM-DD` string comparison instead of `Date` math for validation) is introduced by this spec.
- Per M5 §3.1, the request-to-rent panel only ever renders for a logged-in-non-owner viewer (state A) or a logged-out viewer (state B) — the owner's-own-listing state (C) shows a plain note instead and never mounts `RequestToRentForm`. This spec's new data therefore only needs to reach states A/B.

## 1. Goal / scope

**Goal:** an approved booking's date range should be visibly flagged on the listing detail page's request-to-rent panel *before* a renter tries to submit overlapping dates — Airbnb-style "these dates aren't available" clarity — not just a rejection after they hit submit.

**In scope:**
- A new read path that returns a listing's approved-booking date ranges to *any* viewer of that listing's public page (including logged-out visitors), since the panel itself already renders for logged-out users (M5 §3.1.B).
- A visible "Unavailable dates" callout on the panel listing those ranges in human-readable form.
- Real-time client-side validation that flags a selected start/end range overlapping any blocked range, using the exact same inclusive-overlap comparison the server already uses, and disables submit while an overlap is selected.

**Explicitly out of scope (see §8 for the full list):**
- Any change to `listings.status` (`published`/`unpublished`) or a new "unavailable" listing-level flag. This is per-date-range blocking on an otherwise-bookable listing, not a listing-wide status change.
- Any change to which booking statuses block (`approved` only, unchanged).
- A calendar-grid visual widget (decided against in §3).
- Anything about `pending`-request visibility to other renters — that was never shown before and isn't shown now.

## 2. Backend / data: `listing_approved_booking_ranges`

### 2.1 Why a new function, not a plain client-side `select`

The existing `bookings` RLS policies (M5 §2, `00000000000004_bookings.sql`) only let a caller see rows where they're the renter or the listing's owner. A prospective renter browsing someone else's listing is neither — a plain `select ... from bookings` from the listing detail page would return zero rows for every third-party viewer, silently defeating the whole point of this milestone. This is the identical problem `booking_has_approved_overlap` already solved for the checkpoint-1/2 server-side checks (see that function's own comment block in the migration file) — same shape of problem, now needed for a **public, pre-submission** read instead of a request-time check.

### 2.2 Function shape (reference implementation — exact SQL is backend-engineer's call, same convention as M5 §2's "Expected RLS access pattern... not authoritative SQL")

```sql
create function public.listing_approved_booking_ranges(p_listing_id uuid)
returns table (start_date date, end_date date)
language sql
security definer
set search_path = public
stable
as $$
  select b.start_date, b.end_date
  from public.bookings b
  join public.listings l on l.id = b.listing_id
  where b.listing_id = p_listing_id
    and b.status = 'approved'
    and (l.status = 'published' or l.owner_id = auth.uid())
  order by b.start_date;
$$;

grant execute on function public.listing_approved_booking_ranges(uuid) to anon, authenticated;
```

Design points (mirroring `booking_has_approved_overlap`'s and `booking_contact`'s existing commenting convention — backend-engineer should comment the real migration the same way):

- **`status = 'approved'` only** — never returns `pending`/`declined`/`cancelled` rows. Those are exactly the statuses that must *not* block, and showing them as "unavailable" would actively mislead a renter into thinking dates are taken when they might still be requestable.
- **Returns only `start_date`/`end_date`** — no booking id, no renter identity, no listing title. Same minimum-disclosure principle as `booking_has_approved_overlap`'s boolean-only return: a third-party viewer learns "these date ranges are taken," nothing about who booked them.
- **`SECURITY DEFINER`, granted to both `anon` and `authenticated`** — unlike `booking_has_approved_overlap`/`booking_contact` (authenticated-only, since those are only ever called from an already-authenticated server action), this one must work for a logged-out visitor per M5 §3.1.B, so it's granted to `anon` too.
- **The `l.status = 'published' or l.owner_id = auth.uid()` guard is the one thing genuinely new versus the two existing functions.** Without it, this function could be used to enumerate booking activity on someone's unpublished/draft listing by guessing listing ids — `booking_has_approved_overlap` doesn't need this check because it's only ever called against a listing id the app already resolved from a real page load or an existing booking row, never a raw client-supplied id with no other gate. This function is different: it's reachable from a public page for *any* listing id, so it needs to independently re-derive the same visibility rule as the `"Anyone can view published listings"` RLS policy on `listings` (`00000000000002_listings.sql`) rather than relying on RLS to have already filtered anything (SECURITY DEFINER bypasses RLS by design).
- **No date filtering (e.g. "only future ranges").** Deliberately mirrors `booking_has_approved_overlap`, which also doesn't filter by "today" — a past-dated approved range simply never overlaps a new request whose `start_date >= today` (M5 §3.2's existing "no past-date bookings" rule already guarantees this at the comparison-logic level, §4 below). Keeping the function itself date-agnostic means it has one less thing to get subtly out of sync with "today" across client/server, and keeps its contract identical in spirit to the function it's modeled on.

### 2.3 Where it's called from

`apps/web/src/app/listings/[id]/page.tsx` already runs several server-side Supabase queries for this page (listing row, images, owner profile, reviews). Add one more, alongside them:

```ts
const { data: unavailableRows } = isOwner
  ? { data: [] as { start_date: string; end_date: string }[] }
  : await supabase.rpc("listing_approved_booking_ranges", { p_listing_id: id });
```

- Only fetched when `!isOwner` — the owner-of-own-listing branch (§3.1.C) never renders `RequestToRentForm` at all (it shows the plain "This is your listing." note instead, per M5 §3.1.C — unchanged by this spec), so there's nothing to pass it. This is a straightforward optimization, not a correctness requirement — flagged as such, final call left to backend-engineer/frontend-engineer in §9 if they'd rather always fetch for simplicity.
- Mapped to camelCase and passed down as a new prop, consistent with this component's existing convention of receiving server-derived data as props rather than deriving it client-side (same pattern as `loggedIn`, `loginRedirectTo`):

```ts
<RequestToRentForm
  listingId={listing.id}
  priceAmount={listing.price_amount}
  priceUnit={listing.price_unit}
  loggedIn={Boolean(user)}
  loginRedirectTo={`/listings/${listing.id}`}
  unavailableRanges={(unavailableRows ?? []).map((r) => ({
    startDate: r.start_date,
    endDate: r.end_date,
  }))}
/>
```

- **Failure handling: fail open, don't crash the page.** If the RPC call errors (network blip, etc.), treat it the same as an empty result (`unavailableRanges={[]}`) and let the page render normally — this is safe specifically *because* the server-side checkpoints in `createBookingRequest`/`approveBooking` (M5 §4, unchanged by this spec) remain the actual source of truth and will still reject an overlapping submission with the existing conflict copy. A missing client-side hint degrades the UX for that one page load; it never allows an actual double-booking. Exact logging mechanism (console.error, etc.) is left to backend-engineer, same as every other "log and degrade gracefully" precedent already in this codebase (e.g. `photoError` handling on this same page).
- No new index needed: the existing `bookings_listing_id_status_idx` on `(listing_id, status)` (M5 §2) already narrows this query to exactly the right row set; the `order by start_date` sort runs over a small per-listing result set at MVP scale. Flagged for backend-engineer to confirm, not a hard requirement of this spec.

## 3. Frontend UX decision — native inputs + callout + inline validation, not a calendar grid

**Decision: keep the two native `<input type="date">` fields exactly as they are (M5 §3.2), and add (a) a visible "Unavailable dates" list/callout above the date inputs, plus (b) real-time client-side validation extending the existing `validationMessage` pattern that catches any selection overlapping a blocked range and disables submit.**

Rejected alternative: a from-scratch visual calendar grid with individually greyed-out days. Reasoning:

- This project's convention through M2–M14 has consistently favored plain native inputs over new component surface area for exactly this reason — M5 §3.2 already made and justified this same call for the *original* date picker ("no calendar-grid widget... disproportionate to what an MVP booking form needs... every modern browser renders its own accessible picker UI for free"), and M13 §4's iconography section independently re-confirms the project's general bias against building new custom interactive components when a simpler, cheaper pattern communicates the same thing. Nothing about this milestone's brief changes that calculus — it explicitly asks to avoid a new heavy dependency, and a hand-built calendar grid (own keyboard nav, own mobile tap targets, own accessibility semantics, month navigation for ranges spanning multiple months) is substantial new component surface even without a dependency, not a small addition.
- Native `<input type="date">` genuinely cannot visually greyscale arbitrary non-contiguous days — that capability gap is real and the brief is right to call it out. But the *actual goal* ("visibly blocked, not just rejected-after-submit") does not require a calendar grid to satisfy: a clearly-labeled list of blocked ranges shown before the renter picks anything, plus an immediate inline error the moment their selection crosses one of those ranges, achieves the same Airbnb-ish outcome — "the renter can see it's blocked and gets clear feedback if they try" — without new component surface. The brief's own phrasing ("or gets immediate clear feedback if they try") explicitly anticipates this as an acceptable alternative to true visual greying.
- MVP scale: a given listing realistically has a small number of approved bookings at any time (no evidence of high-volume, always-booked-out listings in this marketplace's expected usage) — a short bullet list reads perfectly clearly at this scale. If a listing ever accumulates enough approved ranges that the list becomes unwieldy, that's a real signal to revisit toward a calendar grid later, not a reason to build one preemptively now (flagged in §9).

## 4. Shared overlap-comparison logic (server query + client validation must match exactly)

Both sides must implement the **identical inclusive-interval-overlap test** `booking_has_approved_overlap` already uses server-side, so the UI never shows a date as pickable that the server would then reject, and never blocks a range the server would actually accept:

```
existing.start_date <= new.end_date  AND  existing.end_date >= new.start_date
```

Applied per blocked range, for the renter's currently-selected `[start_date, end_date]`:

```
function hasOverlap(selectedStart, selectedEnd, blockedRanges):
  for each range in blockedRanges:
    if range.startDate <= selectedEnd AND range.endDate >= selectedStart:
      return true
  return false
```

**This must check the full selected interval against each blocked range — not just whether `selectedStart` or `selectedEnd` individually falls inside a blocked range.** A renter could pick a start date before a blocked range and an end date after it, spanning over the entire blocked range without either endpoint landing inside it; the interval-overlap test above correctly catches that case (and is exactly what the SQL version already does), whereas an endpoint-containment check would miss it.

**Adjacent/same-day edge case, spelled out explicitly (this is the one easy way for client and server to silently disagree):** because the comparison is `<=`/`>=` (inclusive on both sides), if an existing approved booking's `end_date` is `2026-08-16`, a new request with `start_date = 2026-08-16` **overlaps** — same-day handoff is not currently allowed (unchanged M5/M14 behavior; this spec does not add same-day-handoff support). The client validation must treat `2026-08-16` as a blocked start date in that scenario, identical to what the server would reject. Concretely: `blockedRange.endDate >= selectedStart` is `true` when they're equal, so the earliest valid new `start_date` after a blocked range ending `2026-08-16` is `2026-08-17`, both client- and server-side.

**Implementation note:** dates are plain `YYYY-MM-DD` strings from the native date inputs. String comparison (`<=`, `>=`, `<`, `>`) on `YYYY-MM-DD` strings sorts identically to date-value comparison (same property `dayCount`/the existing `endDate < startDate` check in `RequestToRentForm.tsx` already relies on) — no `Date` object parsing is needed for the overlap check, avoiding any TZ-conversion risk. This keeps the client check as simple and TZ-safe as the validation logic already in the file.

## 5. New UI: "Unavailable dates" callout

### 5.1 Placement

Renders directly below the panel's `<h2>` ("Request to rent this tool") and above the date-input row — before the renter picks anything, per the brief's "visibly blocked, not just rejected-after-submit" goal. Renders identically for both the logged-in (state A) and logged-out (state B) renderings of the panel, since blocked dates are equally relevant to a visitor who hasn't logged in yet. **Renders nothing (no empty box, no "no unavailable dates" message) when `unavailableRanges` is empty** — same "only show what's relevant" convention as this page's own `photoError` banner and every empty-state precedent in the app.

### 5.2 Layout / tokens

```
┌───────────────────────────────────────────┐
│ Unavailable dates                          │
│  • Aug 12 – Aug 16, 2026                   │
│  • Sep 1 – Sep 3, 2026                     │
│ The listed end date is included in the     │
│ booking — a new rental can't start until   │
│ the day after.                             │
└───────────────────────────────────────────┘
```

- Container: `mt-3 rounded-lg border border-line bg-surface-muted p-3` — the design system's existing "recessed panel" pattern (same token pairing used for the `/listings` filter panel per `m13-visual-craft-spec.md` §7.2), so this reads as a distinct informational callout rather than another form field.
- Heading: `"Unavailable dates"`, `text-sm font-medium text-foreground` — same tier as the panel's "Start date"/"End date" field labels, so it reads as part of the same panel rather than a new heading level.
- List: `mt-1 list-disc pl-5 text-sm text-foreground`, one `<li>` per range, each rendered via the **existing** `formatDateRange(startDate, endDate)` helper from `apps/web/src/lib/bookings/pricing.ts` (already produces `"Aug 12 – Aug 16, 2026"` — reused verbatim, no new date-formatting logic).
- Subtext (adjacency clarification — see reasoning below): `mt-2 text-xs text-zinc-500 dark:text-zinc-400`, exact copy: **"The listed end date is included in the booking — a new rental can't start until the day after."**

**Reasoning for the subtext:** without it, a renter reading "Aug 12 – Aug 16" would reasonably expect Aug 16 itself to be a valid new start date (that's how exclusive check-in/check-out ranges work on e.g. Airbnb). This app's model is different — whole-day inclusive rentals (M5 §3.2's "Inclusive same-day bookings are allowed... `start_date === end_date` is a valid 1-day rental") — so the blocked range's end date is not available as a new start date (§4's adjacency rule). One sentence of plain-language clarification here is cheap and directly prevents the exact "why is this immediate feedback confusing" failure mode the brief is trying to avoid. No icon is added alongside this callout — M13 §4 deliberately scoped `lucide-react` usage to a specific, enumerated set of empty-state/loading/placeholder contexts; this is a new, different kind of element and doesn't need a matching icon to be clear as plain labeled text, consistent with this project's general "don't add decoration without a clear comprehension gain" bar (M13 §4's own stated standard).

## 6. Interaction spec

### 6.1 Validation priority — extends the existing `validationMessage` chain

`RequestToRentForm.tsx` already computes a single `validationMessage` via a priority-ordered ternary chain (empty start date → invalid end date → `null`). This spec adds one more branch, in this exact order:

```
const hasOverlap = datesValid_soFar && hasOverlap(startDate, endDate, unavailableRanges)   // §4

validationMessage =
  !startDate                          ? "Please choose a start date."
  : !endDate || endDate < startDate   ? "End date must be on or after the start date."
  : hasOverlap                        ? "Those dates overlap an approved booking. Please choose different dates."
  : null

datesValid = validationMessage === null
```

The overlap check only runs once the existing two checks already pass (a range that's incomplete or inverted is reported first — no reason to also compute an overlap against an invalid range). `datesValid` — which already gates the submit button (`disabled={submitting || !datesValid}`) and the price-estimate render — now transitively also gates on "not overlapping," so **no separate new disabled-state wiring is needed**: extending the existing ternary automatically extends the existing gate. This matches the recommended behavior in the task brief exactly.

### 6.2 Exact copy

New inline validation string (rendered in the same `<p className="text-sm text-danger">` slot the existing two messages already use — no new error-display component):

> **"Those dates overlap an approved booking. Please choose different dates."**

Chosen to echo the *tone* of the existing server-side conflict copy (M5 §11: *"Those dates aren't available — this tool is already booked then. Please choose different dates."*) without being identical — this one fires instantly as the renter picks dates (a lighter-weight, more immediate warning), the M5 string is reserved for the rarer post-submit race-condition case (checkpoint 2, two pending requests both slipping past checkpoint 1). Keeping them distinct but clearly related avoids the renter wondering whether they're seeing two different bugs.

### 6.3 Specific flows

- **Renter picks a start date that lands inside (or exactly adjacent to, per §4) a blocked range.** `RequestToRentForm`'s existing `handleStartDateChange` already snaps `endDate` forward to match `startDate` when `endDate < startDate`. Since the initial state has `startDate === endDate === today`, picking a new start date that's still ahead of the current end date leaves `endDate` equal to the new `startDate` — so the overlap check immediately runs on the single-day interval `[newStart, newStart]` and correctly flags it if that day alone is blocked. No special-casing needed beyond the shared `hasOverlap` check already running on every render.
- **Start date is valid and unblocked, but the chosen end date extends the range across a blocked range that doesn't touch either endpoint.** Covered by §4's full-interval overlap check (not endpoint-only) — flagged the same way, same message.
- **Page loads with today's date pre-selected as both start and end (the existing default), and today itself falls inside an approved booking.** The validation message renders immediately on first paint — this is correct, intended behavior (the tool genuinely isn't available today), not a bug to special-case around. It's a direct, honest consequence of surfacing real availability data as early as possible, consistent with the milestone's whole goal.
- **Submit button stays disabled the entire time an overlap is selected** — per §6.1, this falls out of the existing `datesValid` gate automatically; no new disabled-state logic to write.
- **A renter clears/edits a blocked selection back to valid dates.** The error clears and the price estimate (which is also gated on `datesValid`) reappears — identical to how the existing "end before start" validation already behaves; no new behavior to build here beyond the ternary extension.

## 7. Styling notes — tokens used (all from `docs/design/design-system.md`, nothing new invented)

- Callout container: `border-line`, `bg-surface-muted` — existing "recessed panel" pairing.
- Callout heading: same `text-sm font-medium text-foreground` tier already used for "Start date"/"End date" labels.
- List/body text: `text-sm text-foreground`.
- Subtext: `text-xs text-zinc-500 dark:text-zinc-400` — the app's existing meta-text tier (used for location/category/date-range meta everywhere else).
- New inline validation string: `text-sm text-danger` — the exact class the two existing validation messages already use in this file, no new error styling.
- No new color, spacing, radius, or type-scale value is introduced anywhere in this spec — every class above already exists in the design system and is already used elsewhere in this exact component or its immediate siblings.

## 8. Non-goals (explicit)

- **No calendar-grid visual widget** — decided against in §3, with reasoning.
- **No change to `booking_has_approved_overlap`, `createBookingRequest`, or `approveBooking`** — the two existing server-side checkpoints (M5 §4) are untouched; this spec adds a new read-only function and client-side UX on top, nothing that changes write-path behavior.
- **No change to which statuses block** — `approved` only, exactly as M5/M14 already established.
- **No listing-level "unavailable" flag or status** — this is per-date-range blocking on an otherwise-normally-bookable listing, not a change to `listings.status`.
- **No real-time/live updates to `unavailableRanges` while the page stays open** — fetched once per server render, same as every other query on this page. If another renter's booking gets approved while this page is already open in someone's browser, the client-side callout/validation can go briefly stale; this is explicitly acceptable because the server-side checkpoints (unchanged, §0) remain the actual correctness boundary at submit time — the client list is a UX nicety, not a source of truth. No polling, subscription, or revalidation mechanism is added.
- **No cap/pagination on the "Unavailable dates" list** for MVP — flagged in §9 as a future revisit trigger if a listing's list ever grows large enough to be visually unwieldy, not built preemptively.
- **No availability data shown on the owner's own view of their own listing** — the owner-of-own-listing branch (M5 §3.1.C) is unchanged; it still shows the plain "This is your listing." note with no date-picker/callout at all.
- **Mobile (Expo)** — not covered, same boundary as M5.

## 9. Left to backend-engineer / QA judgment

- **Exact SQL formatting/style of `listing_approved_booking_ranges`** — §2.2 gives the required contract (inputs, return shape, security model, visibility guard) but the literal SQL is a reference, not authoritative text to paste verbatim, same convention as M5 §2's RLS reference block.
- **Whether a dedicated index beyond the existing `bookings_listing_id_status_idx` is worth adding** for this function's query pattern — §2.3 argues the existing composite index is likely sufficient at MVP scale; final call is backend-engineer's if real usage suggests otherwise.
- **Whether the page fetches `unavailableRanges` unconditionally or only when `!isOwner`** — §2.3 recommends conditional (the owner branch never needs it), but this is a minor implementation-efficiency call, not a correctness requirement either way.
- **Exact error-logging mechanism for a failed RPC call** — §2.3 requires fail-open/no-crash behavior; whether that's a `console.error`, a structured logger, or something else is left to whatever convention the codebase already uses elsewhere on this page (e.g. how `photoError` / other query failures are currently handled).
- **Whether/when to revisit the "no cap on the unavailable-dates list" call** (§8) if a specific listing's approved-booking count grows large enough to make the callout visually unwieldy — flagged as a QA/product monitoring item post-launch, not a decision this spec makes now.
- **Minor visual details not specified above** (e.g. list marker style beyond Tailwind's default `list-disc`, exact spacing tweaks needed once real content is in the browser) — implementer's normal judgment, no need to round-trip through design for cosmetic-only adjustments that don't change the copy or the token choices in §5/§7.

## 10. Copy reference (exact strings, new in this spec)

- Callout heading: **"Unavailable dates"**
- Callout subtext: **"The listed end date is included in the booking — a new rental can't start until the day after."**
- New inline validation error: **"Those dates overlap an approved booking. Please choose different dates."**
- Date-range list items: rendered via the existing `formatDateRange()` helper (`apps/web/src/lib/bookings/pricing.ts`), e.g. **"Aug 12 – Aug 16, 2026"** — no new formatting logic, no new copy.

All other copy on this panel (heading, field labels, estimate text, submit button, logged-out CTA, the two pre-existing validation messages, and the M5 §4 post-submit conflict messages) is unchanged from `docs/design/m5-booking-spec.md` §11.

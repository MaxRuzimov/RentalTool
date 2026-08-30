# M6 — Reviews & Ratings UX/UI Spec (Renter → Listing, Post-Rental)

Status: ready for implementation
Scope: `apps/web` (Next.js 16 App Router + Tailwind v4), Supabase Postgres — a one-sided (renter reviews listing) rating/review system layered onto the existing booking flow (`docs/design/m5-booking-spec.md`) and listing detail page (`docs/design/m3-listings-spec.md`).
Non-goals for M6: owner-reviews-renter (two-sided reviews), review moderation/flagging/reporting, photo attachments on reviews, owner responses/replies, review sorting/filtering, a new booking status, rating indicators on `/listings` search-result cards, notifications/reminders to leave a review. See §10 for the full list with justification.

## 0. Assumptions engineers should verify before starting

- M2–M5 are merged and behave exactly as documented in `docs/design/m2-auth-spec.md`, `m3-listings-spec.md`, `m4-search-spec.md`, `m5-booking-spec.md`. This spec builds directly on:
  - `apps/web/src/app/listings/[id]/page.tsx` (listing detail page — this spec adds a reviews section to it).
  - `apps/web/src/app/bookings/mine/page.tsx` and `apps/web/src/components/bookings/BookingListingRow.tsx` (this spec adds a "leave a review" slot to eligible rows, reusing the row's existing `actions`/`contact`-style slot pattern).
  - `apps/web/src/lib/bookings/pricing.ts`'s `todayISODate()` (GTA-timezone-correct "today," per its own doc comment) — reused verbatim for the eligibility check in §2, not re-implemented.
  - The `{status, message}`-returning server-action pattern (`useActionState`) used by `ListingForm`, `RequestToRentForm`, `CancelBookingButton`, etc. — the new `createReview` action follows the same shape.
- `bookings.status` is exactly the four-value `pending`/`approved`/`declined`/`cancelled` enum from `supabase/migrations/00000000000004_bookings.sql`, enforced by the `bookings_enforce_transition` trigger. **No new booking status is added by this spec** — see §2's justification for computing eligibility from `approved` + `end_date` instead.
- `listings.status` (`published`/`unpublished`) and its RLS "Anyone can view published listings" policy are unchanged; reviews visibility mirrors that same policy shape (§5).
- This spec is UI/UX-only; the `reviews` table, its RLS policies, and the aggregate-rating query are the backend-engineer's implementation, built to satisfy the field list and access patterns documented here — same division of labor as M3/M5's "spec only; SQL/RLS is the backend engineer's implementation" convention.

## 1. Scope decision — one-sided reviews only: renter reviews the listing

**Decision: M6 ships renter → listing reviews only.** A renter who completed an eligible rental (§2) may leave a 1–5 star rating and optional comment on the listing they rented. Owners reviewing renters (two-sided reviews, the Airbnb/Turo pattern) is **explicitly deferred**, not built in M6.

Justification:
- **Higher-value signal first.** A renter's review of a listing is the signal that actually drives the platform's core loop — a prospective renter deciding whether to trust and book a given tool/owner. An owner's review of a renter has real value too (e.g. "did they return it on time/in good condition"), but it doesn't unblock the primary conversion path the way listing reviews do; it's a trust-and-safety enhancement, not a discovery enhancement.
- **Half the build for the milestone brief's actual ask.** `MILESTONES.md`'s M6 line item is "reyting va sharh tizimi" (rating and review system) with no further detail — it doesn't mandate two-sided. Building both sides doubles the surface area for very similar reasons M5 declined to add a `cancelled_by` column speculatively (§1 of that spec): two-sided reviews would need their own eligibility gate (symmetric to §2 here), their own "leave a review" affordance on the owner's side (`/bookings/owner-requests`), and their own aggregate-display concept (a renter's public "reliability" rating shown... where? there's no renter profile page in this app yet) — real, not-yet-justified new surface area for a "fast and cheap MVP."
- **Additive later.** Nothing in this spec's data model (§4) forecloses adding an `owner_reviews` table (or a `reviewer_role`/`direction` column on this same table) later; it's a clean follow-up milestone, not a redesign.

This is explicit non-goal #1 in §10, not an oversight.

## 2. Eligibility gate — when a booking can be reviewed

**Decision: a booking is eligible to review when `status = 'approved'` AND `end_date < today` (today computed via the existing `todayISODate()` helper, GTA-timezone-correct) AND no review already exists for that `booking_id`.** No new `completed` booking status is added.

### Why `approved` + date comparison, not a new `completed` status

- `bookings.status` today only transitions to `approved` (owner accepted) or a terminal `declined`/`cancelled` — there is no event in the current flow that would ever set a `completed` status (no payment capture, no "mark as returned" step exists or is planned per M5 §10's non-goals). Adding `completed` would require inventing a new transition (who flips it, and when — automatically by a cron/edge function checking dates? manually by either party clicking "mark complete"?) purely to serve this milestone, which is exactly the kind of schema-and-workflow expansion M5 §1 already declined for a much smaller ask (`cancelled_by`).
- `end_date < today` is a **read-only, computed** condition — no migration touching `bookings`, no trigger changes, no risk of interacting with the already-shipped `bookings_enforce_transition` trigger (§1 of M5's migration) which enforces a specific, tested transition table. Zero risk to a merged, working state machine.
- It is trivially expressible in both a page-level query filter and a Postgres RLS `WITH CHECK` clause (§5) using the exact same predicate, so there's no risk of the UI and the DB-level enforcement disagreeing.

### Exact eligibility predicate (used identically in the UI query and RLS insert check)

```sql
b.status = 'approved'
and b.end_date < current_date
and not exists (select 1 from public.reviews r where r.booking_id = b.id)
```

(`current_date` in Postgres is UTC-server-date; the small GTA-timezone edge case this introduces — a booking becomes reviewable a few hours earlier/later than `todayISODate()` would say, right at the UTC/Toronto midnight boundary — is the same class of imprecision M5 already accepted for whole-day booking granularity and is not worth a `timezone()`-aware predicate for a review-eligibility gate. UI-side rendering uses `todayISODate()` for consistency with the rest of the booking flow; a one-day-window mismatch at the boundary is a cosmetic non-issue, not a data-integrity one.)

### One review per booking, not one per renter–listing pair

**Decision: exactly one review per `booking_id`** (enforced by a `unique` constraint on `reviews.booking_id`, §4), not one review per `(renter_id, listing_id)` pair. A renter who rents the same tool twice (two separate `approved` bookings, e.g. different months) can leave a separate review for each rental — the two experiences might genuinely differ (tool condition, owner responsiveness that particular time), and gating on the pair would arbitrarily block the second, more recent, arguably more relevant review.

### No review deadline

**Decision: a review can be left at any time after the booking becomes eligible — no cutoff/expiry.** Per M5 §10, this app has no notification/email system; a deadline (e.g. "review within 14 days") with nothing ever reminding the renter of it would just silently and invisibly close the window, which is worse than no deadline at all. Simpler to leave it open indefinitely — the "leave a review" affordance (§7) just keeps showing up on `/bookings/mine` until used.

## 3. Rating scale and review content

| Field | Type | Required | Notes |
|---|---|---|---|
| Rating | integer, 1–5 | yes | Whole stars only — no half-stars, no 10-point scale. Matches the near-universal 1–5 star convention (Airbnb, Amazon, Google) so no user-facing explanation is needed. |
| Comment | text | no | Optional, max **500 characters** (shorter than a listing `description`'s 2000-char cap per M3 §1 — a review is a quick opinion, not a listing write-up). |
| Title | — | — | **Not built.** A separate headline field adds a second required-or-not decision and a second input for marginal value over a plain comment — every review app's actual signal is the star + the body text; skipped for MVP simplicity, consistent with M2/M3/M5's "fewer fields, one clear submit" pattern. |

Rating is required (a review with no star value is meaningless); comment is optional to keep friction low — a renter who just wants to leave a quick 5-star rating with no write-up shouldn't be blocked from doing so.

## 4. Data model — `reviews` table (spec only; SQL/RLS is the backend engineer's implementation)

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | `uuid`, PK, default `gen_random_uuid()` | yes | |
| `booking_id` | `uuid`, references `bookings(id)` on delete cascade, **`unique`** | yes | Enforces exactly one review per booking (§2). On delete cascade: if a booking row were ever deleted (it isn't today — M5 §2 explicitly has no delete policy on `bookings` — but cascade is the safe default matching every other FK in this schema). |
| `listing_id` | `uuid`, references `listings(id)` on delete cascade | yes | **Denormalized**, not derived via a join through `bookings` on every read — see justification below. Set server-side from the booking's `listing_id` at insert time, never from client input (same "never trust client input for an ownership/relationship column" convention as `listings.owner_id`/`bookings.renter_id`). Immutable after insert (no update path exists at all, see below). |
| `renter_id` | `uuid`, references `auth.users(id)` on delete cascade | yes | The reviewer. Set from the authenticated session server-side, never from client input. |
| `rating` | `smallint`, `check (rating between 1 and 5)` | yes | |
| `comment` | `text`, `check (comment is null or char_length(comment) <= 500)` | no | |
| `created_at` | `timestamptz`, default `now()` | yes | |

No `updated_at` column, and **no `update`/`delete` RLS policy at all** — see the editability decision below.

### Why `listing_id` is denormalized (not derived via `booking_id → bookings.listing_id`)

The highest-traffic read path for this table is `/listings/[id]` — a **public, unauthenticated-reachable** page rendering a listing's review list and aggregate rating on every view. That query needs to be `select ... from reviews where listing_id = $1`, a single indexed equality lookup with no join. Deriving `listing_id` via `booking_id → bookings.listing_id` would require either a join to `bookings` on every listing-page render (a table whose RLS is scoped to "renter or the listing's owner" per M5 §2 — not readable by an anonymous visitor at all, which would break public review visibility entirely unless routed through a security-definer function) or a materialized/duplicated value. Denormalizing `listing_id` directly onto `reviews` sidesteps both problems: the public review-read query never touches `bookings` or its narrower RLS, and it's a plain, cheap, indexed column — same reasoning M5 itself used *against* denormalizing `owner_id` onto `bookings` (that read path already joins `listings` anyway in every case that needs it) applied in the opposite direction here, because this read path does *not* already join `bookings` anywhere in its normal flow.

### Editability decision — reviews are not editable or deletable after posting

**Decision: once submitted, a review's `rating` and `comment` are permanent — no edit, no delete, by the reviewer or anyone else, in M6.**

Justification:
- **Matches an established precedent in this exact codebase.** M5 §10 explicitly declined "booking edit / date-change on an existing request" — a renter who wants different dates cancels and creates a new request instead. The same reasoning applies here: a renter who makes a typo or changes their mind either lives with it (low stakes — it's an optional free-text comment) or, since M6 §2 doesn't gate on "one review per listing" but on "one review per booking," the door is not fully closed if they ever complete a *second* booking on the same listing — though that's not a real fix for a one-off typo, just a note that this isn't a permanent dead end for repeat renters.
- **No `update` policy is simpler to build and reason about than "editable within a window."** A time-boxed edit window (e.g. "editable for 48 hours") requires either an app-level cron-style check or a computed-column-style RLS predicate comparing `now() - created_at` — real, if small, added machinery for a feature (fixing your own typo) that isn't core to the milestone's actual goal (giving future renters a trustworthy signal).
- **Avoids a review-integrity question for free.** If reviews were editable indefinitely, an owner could theoretically pressure a renter (outside the app, via the phone contact from M5 §3.5) into softening a bad review after the fact. Immutable-once-posted reviews are a small, free trust property — the review a browsing renter reads today is the review that was actually left, not a possibly-since-edited one. (Full moderation/dispute tooling is still out of scope, §10 — this is a side effect of the simple default, not a designed trust feature.)
- **A visible cost, accepted for MVP:** a renter who leaves a review, then later notices a typo or wants to revise their opinion, has no recourse in M6. Flagged here explicitly as the natural first fast-follow if this ever becomes a real user complaint — not built now.

## 5. RLS / visibility expectations for backend-engineer

Mirrors the `listing_images` "owner-of-parent-row + public-if-published" policy shape in `00000000000002_listings.sql`:

- **Select:** anyone (`anon` and `authenticated`), including logged-out visitors, can read reviews belonging to a currently-published listing — `exists (select 1 from listings l where l.id = reviews.listing_id and l.status = 'published')`. Same trust level as listing text/photos themselves (M3 §4's photo-visibility precedent). Additionally, a reviewer can always read their own review regardless of the listing's current `status` (`auth.uid() = renter_id`) — a defensive edge case (e.g. an owner unpublishes a listing after being reviewed) so a renter never loses visibility into their own past review.
- **Insert:** only the reviewing renter, and only for their own eligible booking — `with check` combining:
  - `auth.uid() = renter_id`
  - `exists (select 1 from bookings b where b.id = booking_id and b.renter_id = auth.uid() and b.status = 'approved' and b.end_date < current_date)` (§2's exact predicate)
  - `listing_id` must equal that booking's `listing_id` (defense-in-depth against a hand-built request setting a mismatched `listing_id` — the server action already sets it server-side per §4, this is the DB-level backstop, same "RLS is the real boundary" convention as every prior milestone).
  - The `unique` constraint on `booking_id` is the actual enforcement of "exactly one review per booking" — a second insert attempt fails at the constraint level, not just the RLS layer.
- **Update / delete:** no policies of any kind (§4's editability decision) — not even for the reviewing renter.

## 6. Listing detail page — aggregate rating + review list

### 6.1 Aggregate rating — placement and computation

**Decision: a small aggregate line directly under the existing category/location line**, in the same vertical position on `apps/web/src/app/listings/[id]/page.tsx` where title → price → category/location already render (M3 §5.5's existing block, unchanged above this point):

```
Cordless Drill Kit                                    [Edit listing]  (owner only)
$25.00 / day
Power Tools · Etobicoke, ON
★★★★★ 4.6 (12 reviews)                                                 <- new, this spec
```

- If the listing has **zero** reviews: render **"No reviews yet"** in the same position (plain `text-sm text-zinc-500`), not a 5-empty-star row (an empty star row could misread as "rated zero," which is misleading — plain text is unambiguous).
- If the listing has one or more reviews: render the shared `StarRating` component (§9) in read-only mode at `rating={average}` (rounded to the nearest whole star for the *visual* fill, per §9's rounding rule) immediately followed by the exact numeric average to one decimal place and the review count in parentheses: `"4.6 (12 reviews)"` / singular `"5.0 (1 review)"`.
- Computed via `select avg(rating), count(*) from reviews where listing_id = $1` — a single aggregate query added to the existing listing-detail data-fetch, no new page-load round trip beyond what's already there (the page already does several sequential `await`s for images/owner).

### 6.2 Review list — placement and layout

**Decision: a new "Reviews" section rendered below the "Request to rent" panel, at the bottom of the page** (not above it, not interleaved with the description/owner block).

Justification: the request-to-rent panel (M5 §3.1) is the page's primary action and deliberately occupies the same fixed vertical slot for every viewer type (renter, logged-out, owner) — inserting reviews *above* it would push that action further down the page on every single listing view, which actively works against the page's main job (getting a renter to request a booking) in service of secondary, supplementary content (reviews). Reviews belong at the bottom as supporting/confirming evidence a shopper scrolls to *after* they've already seen the core listing info and the action panel — the same "social proof below the fold, primary action above" pattern used by most rental/e-commerce detail pages.

```
┌─────────────────────────────────────────────┐
│  [Request to rent panel — unchanged, M5 §3]  │
└─────────────────────────────────────────────┘

Reviews (12)                                          <- new section, this spec
┌─────────────────────────────────────────────┐
│  ★★★★★  Jane D.  ·  Aug 3, 2026               │
│  Worked great, exactly as described. Would    │
│  rent again.                                  │
└─────────────────────────────────────────────┘
┌─────────────────────────────────────────────┐
│  ★★★★☆  Mike T.  ·  Jul 21, 2026              │
│  Good drill, a bit worn but did the job.      │
└─────────────────────────────────────────────┘
...
```

- Section heading: **"Reviews ({count})"** — e.g. "Reviews (12)"; if zero, heading reads plain **"Reviews"** with no count, followed by the empty state (§8).
- Each review row: same card treatment as `BookingListingRow` (`rounded-2xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-[#0a0a0a]`) — reviewer's first name + last-initial (per `public_profiles.full_name`, formatted the same truncation style used elsewhere, e.g. "Jane D." — first name + last-initial rather than full last name is a reasonable lightweight privacy nicety, not a hard requirement; full name is also acceptable if simpler to implement, backend/frontend engineer's call, not load-bearing for this spec), the review's own star rating (exact integer, read-only `StarRating`), the review's `created_at` formatted the same `MONTH_DAY_YEAR` style already used for booking dates (`formatDateRange`'s underlying `Intl.DateTimeFormat`, e.g. "Aug 3, 2026"), and the comment text (if present) as plain wrapped text below — omit the comment line entirely if `comment` is null/empty, don't render an empty paragraph.
- Order: **`created_at desc`** (newest first) — no sort control, no pagination for M6 (a new listing accumulating enough reviews to need pagination is a later-milestone problem; not building it now matches M4 §12's "no new indexes/pagination" MVP-scale reasoning).
- Query: `select rating, comment, created_at, renter_id from reviews where listing_id = $1 order by created_at desc`, joined to `public_profiles` for the reviewer's display name (same `public_profiles` view used for the owner block on this same page — no new profile-visibility surface).

## 7. "Leave a review" affordance — `/bookings/mine`

**Decision: the affordance surfaces on `/bookings/mine`, inline on each eligible booking row — not as a button on the listing detail page, and not a separate route/page.**

Rationale: a renter needs an *eligible booking* to review anything (§2) — the listing detail page has no way to know, for an arbitrary visitor, which (if any) of their past bookings on that listing are reviewable without doing the same query `/bookings/mine` already does for its own list. Surfacing it on `/bookings/mine`, right next to the specific booking it applies to, is both simpler to build (no new data-fetch on the public listing page beyond §6's read-only aggregate) and clearer to the renter (the review is obviously "about this specific rental," not a generic "review this tool" button floating on the listing page divorced from which rental it refers to).

### 7.1 Row states on `/bookings/mine`

`BookingListingRow` already has a `contact` slot (rendered under the title/date/estimate block) and an `actions` slot (rendered in the top-right, alongside the status badge). This spec adds review UI into the existing `contact`-slot position (directly under the price-estimate line, same left-column placement as the M5 `ContactInfo` line) — reusing the row's existing layout rather than adding a new slot/prop shape, since `contact` and review-state are mutually exclusive in practice (contact only shows on `approved` rows before the rental is over; the review affordance only shows once it's over) but share the same "supplementary info under the main row content" visual role.

Three states, in priority order, for each row on `/bookings/mine`:

1. **Eligible, not yet reviewed** (`status = 'approved'` AND `end_date < today` AND no review exists for this booking): render a small **"Leave a review"** text-button (`text-sm font-medium text-foreground underline`, same secondary-link style as "Edit listing"). Clicking it expands an inline form in place (client component, see §7.2) — no navigation, no modal.
2. **Already reviewed**: render the submitted review read-only, in miniature — the same `StarRating` (read-only, exact integer) plus **"Your review"** label, and the comment text if present, in the same slot. No edit/delete affordance (§4).
3. **Not yet eligible** (`pending`, `declined`, `cancelled`, or `approved` with `end_date >= today`): nothing renders in this slot for review purposes (the `approved`+still-ongoing case still shows the existing M5 `ContactInfo` line as today — review and contact-info are simply two different states of the same slot, gated by different conditions, never shown simultaneously since contact info's condition is "approved" full stop while review eligibility additionally requires the rental to be over).

### 7.2 Inline review form (client component `ReviewForm`)

Rendered in place of the "Leave a review" button once clicked (same "toggle from button to inline form" pattern already used nowhere else in this app yet, but a small, self-contained addition — not a new page, not a modal, consistent with "no new component library, minimal custom components"):

```
┌─────────────────────────────────────────────┐
│  Rate this rental                              │
│  [ ★ ★ ★ ★ ★ ]   (click to select 1–5)         │
│                                                 │
│  [ Optional comment textarea, 500 char max ]   │
│  0/500                                          │
│                                                 │
│  [ Submit review ]   Cancel                     │
└─────────────────────────────────────────────┘
```

- Star input: the shared `StarRating` component in interactive mode (§9) — five clickable stars, `onClick` sets local state `rating` (1–5). No default/pre-selected value; submit is disabled until a rating is chosen (native `required`-equivalent client-side check, since a 5-button click UI has no native HTML `required` semantics).
- Comment: `<textarea maxLength={500}>`, optional, 3 rows, with a small `{length}/500` counter beneath it — same pattern precedent as `title`'s optional character-count nicety noted (but not required) in M3 §5.1.
- Submit button: **"Submit review"** (loading: "Submitting…"), calls `createReview(bookingId, { rating, comment })` server action.
- **Cancel** link/button next to submit: collapses the form back to the plain "Leave a review" button, discarding unsaved input — no confirmation needed (nothing was persisted yet).
- Server-side validation/guards in `createReview` (re-validates everything the client already checked, same defense-in-depth convention as `createBookingRequest`):
  - No session → `{status: "error", message: "Your session has expired. Please log in again."}`.
  - Booking not found, not owned by this renter, not `approved`, or `end_date >= today` → `{status: "error", message: "This booking isn't eligible for a review yet."}`.
  - A review already exists for this booking (race: two tabs, or the row was stale) → `{status: "error", message: "You've already reviewed this booking."}`.
  - `rating` missing or not 1–5 → `{status: "error", message: "Please choose a star rating."}`.
  - `comment` over 500 chars → `{status: "error", message: "Comment must be 500 characters or less."}` (should be unreachable given the `maxLength` attribute, guarded anyway).
- On success: insert the `reviews` row (`listing_id`/`renter_id` derived server-side from the booking, per §4 — never client input), then `router.refresh()` (same pattern as `CancelBookingButton`, no full-page redirect needed — the row re-renders in state 2, "already reviewed," in place). No separate confirmation banner needed; the row visibly flipping from a form to "Your review: ★★★★★" is sufficient feedback, consistent with M5's general preference for in-place state changes over toast/banner notifications where the state change itself is self-evident.
- On error: message renders inline inside the still-open form (same inline-error convention as every other form in the app), form stays open with the renter's chosen rating/comment intact so they don't lose their input.

## 8. Empty states

| Location | Condition | Copy |
|---|---|---|
| `/listings/[id]` aggregate line | Listing has zero reviews | "No reviews yet" (plain text, no star row — §6.1) |
| `/listings/[id]` reviews section | Listing has zero reviews | Heading "Reviews" (no count) + body "No reviews yet — be the first to rent this and leave one." (small, `text-zinc-500`, no CTA link needed — a visitor reading this either isn't eligible yet, per §2, or should just use the request-to-rent panel already on the same page) |
| `/bookings/mine` | No effect — reviews are per-row, not a page-level empty state; the existing M5 §5 empty state ("You haven't requested to rent anything yet.") is unchanged and implicitly covers "you have nothing to review either" | — |

## 9. Star rating component (`StarRating`) — shared display + input

**Decision: one small presentational/interactive component, no new dependency.** Consistent with the "no new component library, minimal custom components" convention established since M2/M4 (M4 §7 chose a plain `<select>` over a chip UI for the same reason; M5 §7 introduced exactly one new visual primitive, `StatusBadge`, and kept it deliberately minimal). `StarRating` is this milestone's one new visual primitive.

- Implementation: five Unicode star characters (`★` filled / `☆` empty), **not** an SVG icon set or an npm star-rating package — zero new dependency, renders identically across browsers/OSes as plain text glyphs styled with Tailwind color classes (`text-amber-500` filled, `text-zinc-300 dark:text-zinc-600` empty).
- Two modes via a single component, e.g. `apps/web/src/components/reviews/StarRating.tsx`:
  - **Read-only** (`interactive={false}`, the default): renders five `<span>` glyphs, filled count = `Math.round(rating)` for fractional aggregate averages (§6.1) or the exact integer for a single review (§6.2/§7.1) — same component, same rounding rule applied uniformly (an integer input rounds to itself, so no special-casing needed).
  - **Interactive** (`interactive={true}`, used only in `ReviewForm`, §7.2): renders five `<button type="button">` elements instead of `<span>`s, `onClick(n)` reports the clicked star's value (1–5) up to the parent's `useState`; filled count = the currently-selected value (or 0 pre-selection, rendering all five empty until the renter picks one).
- Size: `text-lg` in the review list/form, `text-base` in the compact aggregate-line/row-summary contexts — a `size` prop (`"sm" | "md"`) rather than two separate components.

## 10. Non-goals (explicit)

- **Owner reviews renter (two-sided reviews)** — considered and explicitly deferred to a future milestone, see §1's full justification. Not partially built (no schema hook beyond "this table could grow a `direction`/`reviewer_role` column later, additively").
- **Review moderation / reporting / flagging tools** — no "report this review," no admin queue, no takedown mechanism. Same MVP-horizon exclusion as M3 §7's listing-moderation non-goal.
- **Photo uploads on reviews** — text + star rating only, no image attachment (a materially bigger build: Storage bucket + policies + upload UX, mirroring M3 §4's listing-photo machinery, disproportionate to this milestone).
- **Owner responses / replies to reviews** — a listing owner cannot post a public reply under a review in M6. If this becomes a real need later, it's an additive `review_id`-referencing table, not a redesign of this one.
- **Review sorting / filtering beyond default chronological** — no "most helpful," no star-filter, no pagination. `created_at desc`, unpaginated, per §6.2.
- **A new `completed` booking status, or any change to the `bookings` table/its transition trigger** — deliberately avoided; eligibility is computed read-only from `approved` + `end_date`, see §2's full justification.
- **Rating indicator on `/listings` search-result cards (`ListingCard`, M4's grid)** — not built in M6. The milestone brief ("reyting va sharh tizimi") asks for the rating/review system itself, not a change to search-result cards; adding it would mean either an extra aggregate `GROUP BY` query across up to 60 result rows on every `/listings` page load (M4 §10 already flagged even simple filtering as something to keep index-light until there's real evidence of a performance need) or N+1 per-card queries. Flagged here explicitly as the natural next enhancement once M6 ships and there's a real review volume to actually surface — not built now.
- **Review edit / delete** — considered and explicitly declined for MVP, see §4's editability decision.
- **Review submission deadline / expiry window** — considered and explicitly declined, see §2.
- **Notification / reminder to leave a review** — no email/push nudging a renter post-rental to review; consistent with M5 §10's "no notification system exists in this app" non-goal. The renter discovers the "Leave a review" affordance the same way they discover everything else in the booking flow — by revisiting `/bookings/mine`.
- **Mobile (Expo) screens** — this spec covers `apps/web` only, same convention as M3/M4/M5; a mobile-equivalent spec is written separately when M8 starts.

## 11. Copy reference (exact strings)

- Aggregate rating line (has reviews): `"{average} ({count} review{s})"` e.g. "4.6 (12 reviews)", "5.0 (1 review)" — preceded by the `StarRating` glyph row.
- Aggregate rating line (no reviews): "No reviews yet"
- Reviews section heading (has reviews): "Reviews ({count})" e.g. "Reviews (12)"
- Reviews section heading (no reviews): "Reviews"
- Reviews section empty body: "No reviews yet — be the first to rent this and leave one."
- "Leave a review" row button: "Leave a review"
- Inline review form heading: "Rate this rental"
- Comment field placeholder: "Optional — share how the rental went (max 500 characters)."
- Comment character counter: "{length}/500"
- Submit button: "Submit review" (loading: "Submitting…")
- Cancel (collapse form): "Cancel"
- "Already reviewed" row label: "Your review"
- Validation — no rating chosen: "Please choose a star rating."
- Validation — comment too long: "Comment must be 500 characters or less."
- Server guard — not eligible: "This booking isn't eligible for a review yet."
- Server guard — duplicate: "You've already reviewed this booking."
- Server guard — session expired: "Your session has expired. Please log in again."

## 12. Styling notes

- Same visual language as M2–M5: plain Tailwind utility classes, no component library, no new dependency (Unicode star glyphs only — see §9's explicit rejection of an SVG icon set or npm star-rating package).
- Review row cards: identical card treatment to `BookingListingRow` — `rounded-2xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-[#0a0a0a]`.
- Reviews section heading: `text-lg font-semibold text-foreground`, matching the weight/size already used for sub-section headings elsewhere (e.g. `/bookings/owner-requests`'s "Pending requests"/"History" headings use `text-sm font-semibold` — reviews use a slightly larger `text-lg` since this is a page-level section on a public page, not a dashboard sub-list; either is defensible, engineer's call within that range).
- `StarRating`: filled glyphs `text-amber-500`, empty glyphs `text-zinc-300 dark:text-zinc-600`, no background/border — the one new visual primitive this spec introduces (§9), kept intentionally minimal, same "small, reusable, plain-Tailwind" precedent as M5 §7's `StatusBadge`.
- "Leave a review" button: secondary text-link style, `text-sm font-medium text-foreground underline` — same treatment as "Edit listing" (M3 §5.5) and "Cancel filters"-style secondary links (M4 §9).
- "Submit review": primary-style button, same solid-background/white-text treatment as "Request to rent" / "Publish listing".
- Error text: `text-red-600`, small — same as every other form in the app.
- Textarea: reuses the exact border/padding/rounded classes already established for `ListingForm`'s description field (M3 §5.1) — no new input style invented.

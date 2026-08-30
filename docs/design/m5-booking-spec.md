# M5 — Booking Flow UX/UI Spec (Request to Rent, Status, My Bookings)

Status: ready for implementation
Scope: `apps/web` (Next.js 16 App Router + Tailwind v4), Supabase Postgres — a request/approval booking workflow layered onto the existing `/listings/[id]` detail page built in M3/M4.
Non-goals for M5: online payment/checkout UI, in-app messaging/chat, a calendar-grid visual widget, notification/email delivery, recurring or multi-listing bookings, partial-day/hourly time-slot precision. See §10 for the full list with justification.

## 0. Assumptions engineers should verify before starting

- M2–M4 are merged: auth (`docs/design/m2-auth-spec.md`), listings CRUD (`docs/design/m3-listings-spec.md`), and search/filter (`docs/design/m4-search-spec.md`) all work as documented. This spec builds directly on `apps/web/src/app/listings/[id]/page.tsx`, `apps/web/src/app/listings/actions.ts`'s server-action-returning-`{status,message}` pattern, and `apps/web/src/app/listings/mine/page.tsx`'s route-protection + RLS-plus-app-check convention.
- Per `PROJECT_BRIEF.md`, online payment is explicitly **not** in the MVP: "onlayn to'lov MVP'da YO'Q — foydalanuvchilar faqat e'lon ko'radi va bog'lanadi (chat yoki telefon orqali), to'lovni o'zaro kelishadi" (users only browse listings and connect via chat or phone; payment is arranged privately). M5's "booking" is therefore a **request/approval workflow only** — no checkout, no in-app price capture beyond a read-only estimate, no escrow/deposit concept.
- Chat is out of scope through at least M6. The brief's other stated contact channel — phone — is still needed for an approved booking to be *usable* (two people need some way to actually coordinate pickup and payment). §3.5 makes a narrow, scoped call about phone-number visibility to close this gap without building messaging.
- `listings.owner_id`, `listings.price_amount`, `listings.price_unit` (`hour`/`day`/`week`) and `profiles.phone` already exist exactly as described in M2/M3. This spec does not change the `listings` or `profiles` schema.
- This spec is UI/UX-only; the `bookings` table, its RLS policies, and the phone-visibility mechanism in §3.5 are the backend-engineer's implementation, built to satisfy the field list and access patterns documented here — same division of labor as M3's "spec only; SQL/RLS is the backend engineer's implementation" convention.

## 1. Booking status enum and transitions

**Decision: four statuses — `pending`, `approved`, `declined`, `cancelled`.** No separate "who cancelled" field for MVP (see justification below).

### Transition table

| From | To | Who | Notes |
|---|---|---|---|
| *(none)* | `pending` | Renter (on request creation) | Availability-checked at creation, see §4 |
| `pending` | `approved` | Owner | Re-validated for availability at approval time, see §4 |
| `pending` | `declined` | Owner | No reason field for MVP — a plain status change |
| `pending` | `cancelled` | Renter | Renter changed their mind before the owner responded |
| `approved` | `cancelled` | Renter **or** owner | See "who can cancel an approved booking" below |
| `approved` | `declined` | — | **Not a valid transition.** Decline only applies to a still-pending request; once approved, the only way out is cancellation. |
| `declined` | *(any)* | — | Terminal. |
| `cancelled` | *(any)* | — | Terminal. |

```
                 owner approves
        ┌───────────────────────────► approved ───┐
        │                                          │ renter or owner
[new] → pending                                    │ cancels
        │                                          ▼
        ├───────────────────────────► declined  cancelled
        │   owner declines
        └───────────────────────────► cancelled
            renter cancels
```

### Who can cancel an `approved` booking — decision

**Both the renter and the owner can cancel an `approved` booking**, and it lands in the same plain `cancelled` status either way — no distinct `cancelled_by_renter` / `cancelled_by_owner` sub-states or a separate `cancelled_by` column.

Justification: a real reason to distinguish "who cancelled" would be to drive different downstream behavior per party (e.g., a cancellation-reliability score, a different notification, a refund path) — none of which exist in this MVP (no ratings until M6, no notifications per §10, no payment to refund). Recording who cancelled today with no consumer of that fact is speculative schema for a feature that doesn't exist yet; adding a `cancelled_by` column later is a trivial, additive migration if M6+ ever needs it (e.g., a "cancellation rate" reliability signal). For M5, the UI simply needs to know *that* a booking is no longer active, not *by whom* — the `cancelled` status alone is sufficient, and the actor is implicitly whoever's session the cancel action ran under (recoverable from server logs if ever needed for support, but not surfaced in UI).

## 2. Data model shape needed for the UI

A new `bookings` table. Columns the UI needs to read/write (backend-engineer designs the actual migration/RLS to satisfy this):

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | `uuid`, PK | yes | |
| `listing_id` | `uuid`, references `listings(id)` | yes | On delete: cascade (if a listing is deleted, its bookings go with it — same cascade convention as `listing_images`) |
| `renter_id` | `uuid`, references `auth.users(id)` | yes | Set from the authenticated session server-side, never from client input — same convention as `listings.owner_id` |
| `start_date` | `date` | yes | Whole-day granularity only, see §3.2 |
| `end_date` | `date` | yes | Inclusive — a booking where `start_date = end_date` is a valid 1-day rental (see §3.2) |
| `status` | `text` (or Postgres enum, backend's call, same either/or noted in M3 §1 for `listings.category`) | yes | One of `pending` / `approved` / `declined` / `cancelled`, default `pending` |
| `created_at` | `timestamptz`, default `now()` | yes | |
| `updated_at` | `timestamptz`, default `now()` | yes | Maintained by the existing `public.set_updated_at()` trigger, same pattern as `listings`/`profiles` |

### No `owner_id` column on `bookings`

Not required by the UI: the owner of a booking's listing is always reachable via `listings.owner_id` through `listing_id`, and every UI query that needs "is this booking mine as an owner" already joins to `listings` anyway (§6). Flagging for backend-engineer only as an optional call: denormalizing `owner_id` onto `bookings` may simplify the RLS policy for "owners can view/approve/decline bookings on their own listings" (avoids a subquery/EXISTS against `listings` in the policy) — purely a backend implementation convenience, not a UI requirement, and not decided here.

### No stored total-price / estimate column — decision

**Recommendation: do not store a total-price estimate on `bookings`. Compute it on read**, client- or server-side, from `listing.price_amount` / `listing.price_unit` (joined via `listing_id`) × the booking's date range, using the exact formula in §3.3.

Justification: a stored estimate would go stale the moment an owner edits their listing's price after a booking already exists (M3's edit flow has no restriction preventing a price change on a listing with active bookings, and this spec doesn't add one) — the stored number would then silently disagree with the listing's current price, which is confusing and has no clear "source of truth" story to fix later. Computing on read is also strictly simpler: one multiplication at render time, no extra column, no risk of the estimate and the live listing price ever disagreeing. The MVP explicitly has no payment capture (§0), so this number is informational only ("here's roughly what this would cost") — it is never the value anything gets charged against, which removes the usual reason (an immutable record of what was agreed/charged at booking time) to snapshot it.

### Expected RLS access pattern (reference for backend-engineer, not authoritative SQL)

Mirrors the `listing_images` policy style in `00000000000002_listings.sql` (owner-of-parent-row access via `EXISTS` join):

- Renter can `select`/`insert` their own bookings (`renter_id = auth.uid()`).
- Renter can `update` (status only, to `cancelled`) their own bookings — or this is done via a server action using the service/user client with an explicit ownership check before the update, matching the "RLS is the real boundary, the page-level check is what keeps the UX honest" convention from M3 §6. Either is acceptable; the UI does not depend on which.
- Listing owner can `select` bookings where `EXISTS (select 1 from listings l where l.id = bookings.listing_id and l.owner_id = auth.uid())`.
- Listing owner can `update` (status only, to `approved`/`declined`, or to `cancelled`) bookings under the same `EXISTS` condition.
- No `delete` policy is needed for either party — cancelling is a status change, not a row deletion (keeps history intact for §5/§6's "history" sections).

### Suggested indexes (guidance, not required by this spec)

`bookings_renter_id_idx` (renter's "My requests" query), `bookings_listing_id_status_idx` on `(listing_id, status)` (the availability-overlap check in §4 filters by `listing_id` and `status = 'approved'` on every request/approval). Final call is backend-engineer's.

## 3. "Request to rent" — listing detail page

This replaces the existing placeholder line in `apps/web/src/app/listings/[id]/page.tsx` (currently `<p ...>Contact details coming soon</p>` at line ~129) **entirely**. There is no scenario in the finished M5 flow where "Contact details coming soon" is still the right copy — it existed only because M3 had nothing to put there yet.

### 3.1 Three renderings of the same panel, by viewer type

The listing detail page (a server component) already fetches `user` and computes `isOwner`. A new panel renders in the same position the placeholder text used to occupy, below the owner info block, choosing one of three states:

**A. Logged-in, not the owner (the normal case)** — the real interactive widget: a small client component (`RequestToRentForm`, same "small client component embedded in a server page" pattern already used for `OwnerAvatar`), containing:

```
┌─────────────────────────────────────────────┐
│  Request to rent this tool                    │
│                                                │
│  Start date          End date                 │
│  [____________]      [____________]           │
│                                                │
│  Estimated total: $125.00 for 5 days           │
│  ($25.00 / day)                                │
│                                                │
│  [ Request to rent ]                           │
└─────────────────────────────────────────────┘
```

**B. Logged out** — the identical panel (same date inputs, same live price estimate — letting a visitor gauge cost before creating an account is good UX and costs nothing extra to build, since the estimate is pure client-side arithmetic requiring no auth), but the submit button is replaced with a link:

```
[ Log in to request this tool ]   →  /login?redirectTo=/listings/[id]
```

Same `redirectTo` query-param convention already used everywhere else in the app (`/login?redirectTo=/listings/new`, etc., per M2 §5 / M3 §6) — after logging in, the visitor lands back on this exact listing page and can immediately use the real form.

**C. Logged in, viewing your own listing** — the date-picker/estimate UI is **not** shown at all (an owner requesting to rent their own tool is a meaningless action, and the server action rejects it anyway per §3.4 as a defense-in-depth backstop). Instead, a small plain note:

```
This is your listing.
View requests →  /bookings/owner-requests
```

Justification for showing a note (rather than nothing): the panel occupying that exact vertical position for every other viewer means an owner seeing *nothing* there could read as "the page is missing something" — one line plus a useful link (straight to where they'd actually manage requests on this listing) is cheap and orients them correctly, consistent with M3 §5.5's existing owner-only "Edit listing" link pattern on this same page.

### 3.2 Date inputs — native `type="date"`, whole-day granularity

**Decision: two native `<input type="date">` fields**, no calendar-grid widget, consistent with this app's established "no new component library, minimal custom components" convention (same reasoning M4 §7 used to choose a plain `<select>` over a chip UI). A styled calendar-grid date-range picker (the kind with a visual month grid and click-drag range selection) is real, custom component surface area — a dependency or a hand-built widget with its own keyboard/mobile/accessibility work — disproportionate to what an MVP booking form needs. Native date inputs are fully keyboard- and mobile-native, require zero new styling beyond the border/padding treatment already used on every other form input in the app (M3 §5.1), and every modern browser renders its own accessible picker UI for free.

Documented simplification: **whole-day granularity only** — no time-of-day/hour-slot picker (see §10). This applies uniformly regardless of the listing's `price_unit`; an hourly-priced listing is still requested via a start/end date range, not a start/end date-*and*-time range. This keeps exactly one input pattern across all listings rather than branching the form's shape by `price_unit`.

Field rules:
- `start_date`: `required`, `min` = today's date (client-computed via `new Date()` in the client component — same reasoning that lets `OwnerAvatar` be a small client component within an otherwise server-rendered page). No past-date bookings.
- `end_date`: `required`, `min` = the currently-selected `start_date` (updated on change, via a small `onChange` handler — plain React state, no form library). **Inclusive same-day bookings are allowed** — `start_date === end_date` is a valid 1-day rental. This is simpler than requiring `end_date` strictly after `start_date` and matches how a renter would naturally think of "I need it Saturday" as a 1-day booking, not an invalid range.
- If `end_date` is ever left blank or set earlier than `start_date` (e.g. a user manually edits the field after changing `start_date`), disable the submit button and show inline text "End date must be on or after the start date." — mirrors the inline-validation style already used in `ListingForm`.
- Day count formula used everywhere in this spec: **`days = (end_date − start_date in whole days) + 1`** (inclusive on both ends).

### 3.3 Estimated price display — by `price_unit`

The estimate line updates live (client-side) as either date changes, using the listing's already-fetched `price_amount`/`price_unit` (no extra network call — the listing detail page already has these values in scope).

| `price_unit` | Display | Formula |
|---|---|---|
| `day` | "Estimated total: **$125.00** for 5 days ($25.00 / day)" | `price_amount × days` — exact, no rounding needed |
| `week` | "Estimated total: **$100.00** for 5 days — billed as 1 week ($100.00 / week)" (small subtext: "Rounded up to the nearest full week.") | `price_amount × ceil(days / 7)` |
| `hour` | "$15.00 / hour — total cost depends on hours used. Confirm the total with the owner." (no computed total shown) | *(none — see below)* |

Justification for the `hour` case specifically: turning a whole-day date range into a hypothetical hourly total requires guessing an hours-per-day usage assumption (8 hours? 24 hours? a full workday?) that has no basis in the data — exactly the same "arbitrary conversion factor" problem M4 §6 already identified and rejected for cross-unit price *filtering*. Rather than inventing a number that could materially mislead a renter about cost, the widget shows the honest rate and defers the actual total to the phone conversation the brief already expects to happen (§0). The `week` case's "round up to a full week" is a much smaller, clearly-labeled assumption (you cannot rent 0.7 of a week from a weekly-priced tool in practice) and is called out in the UI text itself so it's never a silent surprise.

### 3.4 Submit behavior

- Button label: **"Request to rent"** (loading: "Sending request…") — a client form using the same `useActionState`-backed `{status, message}` server-action pattern as `ListingForm` (M3 §0's established mutation convention), calling a new `createBookingRequest(listingId, formData)` server action.
- Server-side validation/guards (the real boundary, mirroring `createListing`'s pattern of re-validating everything the client already checked):
  - No session → `{status: "error", message: "Your session has expired. Please log in again."}` (should be unreachable given §3.1's logged-out treatment, but guarded anyway, same defense-in-depth precedent as `updateListing`'s ownership re-check).
  - Requesting your own listing (`listing.owner_id === user.id`) → `{status: "error", message: "You can't request to rent your own listing."}` (defense-in-depth backstop for §3.1.C — the button shouldn't be reachable, but a hand-built request must still be rejected).
  - `start_date` in the past, or `end_date` before `start_date` → same inline validation messages as §3.2, re-checked server-side.
  - Availability conflict → see §4 for the exact mechanism and copy.
- On success: **create the `bookings` row** (`status = 'pending'`, `renter_id` from session) and `redirect('/bookings/mine?requestSent=1')` — the renter lands on their own bookings list and sees the new pending request in context, with a small green confirmation banner "Request sent! The owner will respond soon." rendered at the top when `requestSent=1` is present (same `?saved=1`-style query-flag confirmation pattern already used on `/profile`, M2 §4).
- On error: message renders inline in the `RequestToRentForm` panel, same place/style as `ListingForm`'s error area — the renter stays on the listing page with their chosen dates still filled in (client state isn't lost, since this doesn't redirect).

### 3.5 Phone visibility on `approved` bookings — decision

Not explicitly asked for in the milestone brief, but necessary for an "approved" booking to actually be useful: per `PROJECT_BRIEF.md` §0, contact happens "chat yoki telefon orqali" (via chat or phone) with payment arranged privately — chat is out of scope through M6, which makes phone the only channel the brief provides for two matched parties to actually coordinate pickup and payment.

**Decision: once a booking's status is `approved`, each party can see the other party's name and phone number** (renter sees the listing owner's phone; owner sees the renter's phone) on that booking's row in `/bookings/mine` (§5) and `/bookings/owner-requests` (§6) respectively — nowhere else, and not before approval. `profiles.phone` is otherwise still private (M2 §4's "Only visible to you for now" note is unchanged for every other context).

Schema note for backend-engineer (mechanism intentionally left to their judgment, not designed here): the UI needs a query path that returns `{full_name, phone}` for the counterparty of a specific `approved` booking. The `public_profiles` view (M2) deliberately excludes `phone` and remains unchanged — this is a narrower, booking-scoped exception, not a general profile-visibility change. A small security-definer function (e.g. `booking_contact(booking_id uuid) returns table(full_name text, phone text)`) or an additional RLS policy on `profiles` scoped to `EXISTS (select 1 from bookings b join listings l on l.id = b.listing_id where b.status = 'approved' and ((b.renter_id = auth.uid() and l.owner_id = profiles.id) or (l.owner_id = auth.uid() and b.renter_id = profiles.id)))` both satisfy this; either is acceptable, backend-engineer's call.

Display copy: a small line under the booking row once approved — "Contact: Jane D., (647) 555-0100" with subtext "Arrange pickup and payment directly." If the counterparty's `phone` is null/empty (M2 never required it), show "No phone number on file — contact via [full_name]'s profile." as a graceful fallback (no dead end, no crash).

## 4. Availability-conflict handling

**Decision: application-level checks at two checkpoints — request creation and owner approval — not a database exclusion constraint.**

Only an **`approved`** booking blocks a date range. `pending` and `declined`/`cancelled` bookings never block anything — a listing can have any number of overlapping `pending` requests for the same dates simultaneously (whichever the owner approves first "wins"; the rest fail approval per checkpoint 2 below, or the owner can decline them manually).

### Checkpoint 1 — at request creation (`createBookingRequest`)

Before inserting the new `pending` row, query for any existing `approved` booking on the same `listing_id` whose range overlaps the requested range (standard inclusive interval overlap: `existing.start_date <= new.end_date AND existing.end_date >= new.start_date`). If one exists, reject with:

> "Those dates aren't available — this tool is already booked then. Please choose different dates."

### Checkpoint 2 — at owner approval (`approveBooking`)

This is the real safety net, not checkpoint 1. Because `pending` requests never block each other, it's entirely possible for two renters to both hold `pending` requests on overlapping dates simultaneously (both passed checkpoint 1, since neither was `approved` yet). The moment an owner approves one of them, the *other* pending request — if the owner later tries to approve it too — must be re-checked against what's now actually `approved`, using the exact same overlap query as checkpoint 1 but run again at approval time. If the owner attempts to approve a `pending` request that now overlaps a booking that became `approved` in the meantime (whether from a genuinely different pending request, or literally a second click within the same request), reject the approval — the booking **stays `pending`**, it is not silently auto-declined — and show:

> "Couldn't approve — these dates were just booked by another approved request. Decline this request or ask the renter to choose different dates."

This is rendered inline on `/bookings/owner-requests` next to the affected row (same inline-error convention as everywhere else in the app), not a crash or a generic 500 — the owner remains free to `Decline` it or simply leave it `pending` and follow up with the renter.

### Why application-level checks, not a DB exclusion constraint

A Postgres `EXCLUDE USING gist` constraint (with `btree_gist` + a `daterange` column) would close the narrow race-condition window that two checkpoints alone can't fully eliminate (e.g. two approvals landing in the same instant). That's a real gap, but at MVP scale — a new single-region marketplace with low concurrent-approval volume per listing — the odds of two owners' approval clicks landing within the same transaction window on the *same listing* are low, and the two-checkpoint approach already turns the practical failure mode into "a clear, recoverable error message" rather than silent double-booking or a crash. Building and maintaining a `daterange`/GiST-index constraint (plus the extra migration complexity and the need to translate its constraint-violation error into the friendly copy above, since a raw DB exclusion error is not renter/owner-facing text) is more machinery than this MVP's actual risk profile justifies right now. Flagged here explicitly as the natural hardening step if this ever proves insufficient under real usage — not built in M5.

## 5. My bookings (renter view) — `/bookings/mine`

Route chosen for consistency with the existing `/listings/mine` naming convention (a user's-own-records index under a plural resource root). Auth required, same server-side redirect pattern as every other protected route: `redirect('/login?redirectTo=/bookings/mine')`.

- Page title: "My bookings".
- If `?requestSent=1` is present: green confirmation banner "Request sent! The owner will respond soon." (same query-flag banner convention as `/profile`'s `?saved=1`).
- Fetches all `bookings` where `renter_id = current user.id`, ordered `created_at desc`, joined to `listings` for title/cover-image/price/price_unit (cover image fetched the same way `/listings/mine` already resolves cover URLs via `signImageUrls`).
- Each row: listing cover thumbnail (or `ImagePlaceholder`, same component as `/listings/mine`), listing title (links to `/listings/[id]`), date range (e.g. "Aug 12 – Aug 16, 2026"), computed estimated total (§3.3's formula, reused here), status badge (§7), and — when applicable — a "Cancel request" button.
- **Cancel is available for `pending` and `approved` statuses only** — not `declined` (nothing to cancel, the owner already said no) and not `cancelled` (already terminal). Clicking it shows the same native `confirm()` pattern already used for listing delete (M3 §5.2): "Cancel this booking request? This cannot be undone." On confirm, calls `cancelBooking(bookingId)`, which re-checks `renter_id = auth.uid()` server-side before updating `status = 'cancelled'`, then reloads the same page (no redirect needed — same page, updated data).
- When `status = 'approved'`, also render the owner's contact info per §3.5.

### Empty state

- "You haven't requested to rent anything yet." + a **"Browse listings"** link → `/listings` (same centered-container empty-state styling as `/listings/mine`'s `rounded-2xl border ... py-16 text-center`).

## 6. Owner requests (owner view) — `/bookings/owner-requests`

**Decision: a dedicated page under `/bookings`, not a section folded into `/listings/mine`.** `/listings/mine` is scoped to listing CRUD (edit/delete a listing you created) — bookings are a materially different resource with different actions (approve/decline vs. edit/delete) and a request can exist on any of an owner's listings, so a booking-centric list (not grouped by listing) is the more useful shape. Route `/bookings/owner-requests` does not collide with `/bookings/mine` or any `/listings/*` route.

- Page title: "Requests to me" (matches the sub-nav label, §8).
- Auth required, same `redirect('/login?redirectTo=/bookings/owner-requests')` pattern.
- Fetches all `bookings` where the joined `listings.owner_id = current user.id` (via the `EXISTS`/join RLS pattern in §2), joined to `listings` for title/cover/price, and to the renter's `public_profiles` row for display name (plus `profiles.phone` per §3.5 once `approved`).
- Two sections, in this order:
  1. **"Pending requests"** — `status = 'pending'`, ordered `created_at desc`. Each row shows renter name, which listing, date range, estimated total, and two buttons: **Approve** / **Decline**. No confirmation dialog on either (both are easily correctable — declining doesn't destroy data, and approving that turns out wrong can still be cancelled per §1's transition table) — direct one-click actions, consistent with keeping the MVP interaction light.
  2. **"History"** — `status` in `approved` / `declined` / `cancelled`, ordered `created_at desc`. Same row shape, status badge instead of action buttons, plus the contact-info line for `approved` rows (§3.5) and no action for `declined`/`cancelled` (both terminal). An owner *can* still cancel an `approved` row from here — see §1 — so "Cancel" appears on `approved` rows in this section too.
- If a pending request's approval fails the checkpoint-2 overlap re-check (§4), the inline error renders directly under that row without navigating away or losing the rest of the list.

### Empty state

- "No booking requests yet." + subtext "Requests to rent your listings will show up here." No CTA link needed (an owner with zero listings already sees this same page shape; there's nothing productive to link to from here — `/listings/new` is reachable via the header/`/listings/mine` already).

## 7. Status badge visual treatment

No existing badge precedent in the app to reuse — M3 deliberately shipped `listings.status` (`published`/`unpublished`) with **no** UI badge at all (M3 §1: "no 'Draft' badge... no UI exposes it"). This is the first badge component in the app; established here as a small, reusable pattern (plain Tailwind, no dependency) rather than a one-off:

| Status | Label | Classes |
|---|---|---|
| `pending` | "Pending" | `bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300` |
| `approved` | "Approved" | `bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300` |
| `declined` | "Declined" | `bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300` |
| `cancelled` | "Cancelled" | `bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400` |

Shared shape for all four: `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium` — a small pill, using the same `rounded-full` scale already established for buttons (M2 §7 "rounded-full primary button") so it reads as part of the same design system rather than a new shape language. Implemented as one small presentational component (e.g. `apps/web/src/components/bookings/StatusBadge.tsx`) taking `status` and returning the right label/classes — reused identically on `/bookings/mine` and `/bookings/owner-requests`.

## 8. Navigation entry

Checked `apps/web/src/components/Header.tsx`: logged-in nav today is `Browse listings · My listings · {name} · Log out` — four items, no dropdown (M2 §1 explicitly: "No dropdown menu needed for M2 — two plain elements side by side is enough," a pattern this spec keeps).

**Decision: add exactly one new top-level nav link, "Bookings" → `/bookings/mine`**, placed after "My listings" and before the account name link — not two separate links (which would push the header to six items). Both booking views are still one click apart via a small in-page sub-nav rendered at the top of both `/bookings/mine` and `/bookings/owner-requests`:

```
My requests · Requests to me
```

Rendered as two plain text items separated by a middot, styled with the same `text-sm font-medium` treatment as other secondary nav — whichever page you're currently on renders as plain (non-link) bold text, the other renders as an underlined `<Link>`. This needs no client-side pathname detection (`usePathname`, etc.) since each page is a separate server component that trivially knows which one it is — just two hardcoded variants of the same two-item strip, one per file. Kept deliberately as plain text/links, not a tab component — matches "minimal custom components."

## 9. (see §3.5 for phone-visibility — folded into the request-to-rent section since it's a direct consequence of that flow, not a separate screen)

## 10. Non-goals (explicit)

- **Payment / checkout UI of any kind** — no price capture beyond the read-only estimate in §3.3, no deposit, no escrow, no "mark as paid" status. Per the brief, payment is arranged privately between the two parties entirely outside this app.
- **In-app messaging / chat** — out of scope through at least M6 per the task brief. §3.5's phone-number reveal on `approved` bookings is the narrow, brief-mandated substitute ("...telefon orqali"), not a general messaging feature.
- **Calendar-grid visual widget** — deliberately not built; two native `type="date"` inputs are used instead (§3.2), consistent with this app's no-new-component-library convention.
- **Notification / email system** — no emails, push, or SMS on status change. In-app status visibility (badges on `/bookings/mine` and `/bookings/owner-requests`, checked on page load) is the only signal for MVP; a renter/owner finds out their request was approved/declined by revisiting the app, same as how the rest of this app has no notification layer today.
- **Recurring or multi-listing bookings** — one booking request always covers exactly one listing and one contiguous date range. No "book these 3 tools together," no repeating weekly bookings.
- **Partial-day / hourly time-slot picker precision** — whole-day granularity only, regardless of `price_unit` (§3.2/§3.3). An hourly-priced listing is still requested via whole calendar days.
- **A DB-level exclusion constraint for availability** — considered and explicitly deferred in favor of the two-checkpoint application-level approach (§4); flagged as a future hardening step, not built now.
- **Maximum booking duration cap** — no upper bound on `end_date − start_date` for MVP; an owner who receives an unreasonable request can simply Decline it.
- **Booking edit / date-change on an existing request** — a renter who wants different dates cancels and submits a new request; there is no "modify this pending request's dates" affordance.
- **Mobile (Expo) screens** — this spec covers `apps/web` only, same convention as M3/M4; a mobile-equivalent spec is written separately when M8 starts.

## 11. Copy reference (exact strings)

- Widget heading: "Request to rent this tool"
- Date field labels: "Start date", "End date"
- Estimate (day unit): "Estimated total: $125.00 for 5 days" + "($25.00 / day)"
- Estimate (week unit): "Estimated total: $100.00 for 5 days — billed as 1 week" + "($100.00 / week)" + subtext "Rounded up to the nearest full week."
- Estimate (hour unit): "$15.00 / hour — total cost depends on hours used. Confirm the total with the owner."
- Submit button: "Request to rent" (loading: "Sending request…")
- Logged-out CTA: "Log in to request this tool" → `/login?redirectTo=/listings/[id]`
- Owner-of-own-listing note: "This is your listing." + link "View requests" → `/bookings/owner-requests`
- Validation: "Please choose a start date.", "Start date can't be in the past.", "End date must be on or after the start date."
- Own-listing server guard: "You can't request to rent your own listing."
- Session-expired guard: "Your session has expired. Please log in again."
- Conflict at request time: "Those dates aren't available — this tool is already booked then. Please choose different dates."
- Conflict at approval time: "Couldn't approve — these dates were just booked by another approved request. Decline this request or ask the renter to choose different dates."
- Success banner (My bookings, after `?requestSent=1`): "Request sent! The owner will respond soon."
- Cancel button (both pages): "Cancel request"
- Cancel confirm dialog: "Cancel this booking request? This cannot be undone."
- Approve button: "Approve"
- Decline button: "Decline"
- Contact line (approved bookings): "Contact: {full_name}, {phone}" + subtext "Arrange pickup and payment directly."
- Contact fallback (no phone on file): "No phone number on file — contact via {full_name}'s profile."
- My bookings page title: "My bookings"
- My bookings empty state: "You haven't requested to rent anything yet." + "Browse listings" → `/listings`
- Owner requests page title: "Requests to me"
- Owner requests section headings: "Pending requests", "History"
- Owner requests empty state: "No booking requests yet." + subtext "Requests to rent your listings will show up here."
- Status badge labels: "Pending", "Approved", "Declined", "Cancelled"
- Header nav link: "Bookings" → `/bookings/mine`
- Sub-nav strip (both booking pages): "My requests" (→ `/bookings/mine`), "Requests to me" (→ `/bookings/owner-requests`)

## 12. Styling notes

- Same visual language as M2–M4: plain Tailwind utility classes, no component library, no new dependency (native `<input type="date">` only).
- Request-to-rent panel: same card treatment as the M4 filter bar and M3's empty-state containers — `rounded-2xl border border-black/[.08] p-4 dark:border-white/[.145]`, so it reads as one more panel in the existing design system.
- Date inputs and their labels reuse the exact border/padding/rounded/label classes already established for `ListingForm`'s fields (M3 §5.1) — no new input style invented.
- "Request to rent" button: primary-style, same solid-background/white-text treatment as "Publish listing" / "Apply filters".
- "Cancel request", "Decline": secondary/destructive-leaning text style, same red-leaning treatment already used for "Delete listing" (M3 §9).
- "Approve": primary-style button, same treatment as other primary actions.
- Status badges: see §7 for the shared pill classes — the one new visual primitive this spec introduces, kept intentionally minimal (background + text color only, no icons).
- Error text: `text-red-600`, small — same as every other form in the app; success/confirmation banners: `text-green-600` background-tinted container, matching `/profile`'s `?saved=1` banner treatment.
- Empty states on `/bookings/mine` and `/bookings/owner-requests`: identical container styling to `/listings/mine`'s empty state (`rounded-2xl border ... py-16 text-center`).

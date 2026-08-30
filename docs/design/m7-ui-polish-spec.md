# M7 — Web UI Polish / Responsive Design Spec (Audit + Punch List)

Status: ready for implementation
Scope: `apps/web` only (Next.js 16 App Router + Tailwind v4). This is an **audit-and-fix pass** on the UI shipped in M2–M6 — no new features, no new pages, no new component library, no visual rebrand. Every item below was found by reading the actual shipped code (not just the M2–M6 specs) and reasoning about it at phone widths (~320–375px), `sm` (640px), `md` (768px), and `lg` (1024px+), using Tailwind's default breakpoints.

## 0. Method / assumptions

- Read `docs/design/m2-auth-spec.md` through `m6-reviews-spec.md` in full first, to know each milestone's stated styling/mobile conventions, then read every page/component listed in the M7 task brief against those conventions and against each other.
- No visual testing tool was run (no dev server / browser in this environment) — every width estimate below is computed from actual Tailwind classes (padding, gap, fixed heights/widths) in the shipped files, not guessed. Where a computation is close/borderline, that's called out explicitly rather than overstated as certain breakage.
- "Fix" entries give the exact before/after Tailwind classes, reusing a pattern already established elsewhere in the app wherever one exists (per the task's explicit instruction), rather than inventing new breakpoint conventions.
- Established reusable patterns found and referenced repeatedly below:
  - **M4's filter-bar mobile pattern** (`apps/web/src/app/listings/page.tsx`): stack fields full-width on mobile, switch to a row at `sm:`. This is the app's one documented "multi-field-row responsive" precedent — reused for every other cramped side-by-side field pair found below.
  - **Card container**: `rounded-2xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-[#0a0a0a]` (rows/cards) or the same border/radius with `p-8` (auth/listing form cards).
  - **Empty-state container**: `flex flex-col items-center gap-4 rounded-2xl border border-black/[.08] py-16 text-center dark:border-white/[.145]`.
  - **Primary button**: solid `bg-foreground text-background rounded-full`, height varies by context (see §9).

## 1. Priority punch list (summary)

| # | Area | File(s) | Severity |
|---|---|---|---|
| 1 | Header nav overflow, 5 items no-wrap below `md` | `components/Header.tsx` | P0 |
| 2 | Booking row layout collapses on narrow phones (worst on owner pending rows with Approve/Decline) | `components/bookings/BookingListingRow.tsx`, `ApproveDeclineButtons.tsx` | P0 |
| 3 | `/` is still the unedited `create-next-app` boilerplate — off-brand, off-palette, links to vercel.com/nextjs.org | `app/page.tsx`, `app/layout.tsx` (metadata) | P0 |
| 4 | Request-to-rent start/end date inputs don't stack on mobile | `components/bookings/RequestToRentForm.tsx` | P1 |
| 5 | Listing form price/unit row doesn't stack on mobile (worse than #4 — has a `$` prefix eating width) | `components/listings/ListingForm.tsx` | P1 |
| 6 | Interactive star-rating buttons are ~18px tap targets | `components/reviews/StarRating.tsx` | P1 |
| 7 | `MyListingCard` has the same row-cramping shape as #2, lower severity | `components/listings/MyListingCard.tsx` | P1 |
| 8 | Empty-state container spacing drift (`gap-2` vs. the app's `gap-4`) | `app/bookings/owner-requests/page.tsx` | P1 |
| 9 | Primary-button height has three unreconciled values app-wide (h-9/h-10/h-11) | multiple (see §9) | P1 |
| 10 | Header horizontal padding (`px-6`) doesn't match the `px-4` convention every page content container uses | `components/Header.tsx` | P2 |
| 11 | Long `full_name` in header nav has no width cap/truncation | `components/Header.tsx` | P2 |

Detailed sections follow, one per area, each with exact file/line context and the exact class change.

## 2. Header / nav overflow — P0

**File:** `apps/web/src/components/Header.tsx`

Current shipped markup (unchanged since M2, extended by M5 §8 without revisiting mobile):

```tsx
<header className="flex items-center justify-between border-b border-black/[.08] px-6 py-4 dark:border-white/[.145]">
  <Link href="/" ...>RentalTool</Link>
  <nav className="flex items-center gap-4 text-sm font-medium">
    {/* logged in: Browse listings · My listings · Bookings · {name} · Log out — 5 items */}
  </nav>
</header>
```

**Problem:** `nav` has `flex items-center gap-4` with **no `flex-wrap`** and no `shrink`/truncation on any child. For a logged-in user the five items ("Browse listings", "My listings", "Bookings", `{full_name}`, a "Log out" button) plus the "RentalTool" wordmark need roughly 550–600px of horizontal space at their natural size — more than the entire viewport on any phone (320–428px) and tight even at `sm` (640px) once `px-6` container padding and a longer name are accounted for. Because nothing shrinks or wraps, this produces horizontal overflow (the header becomes wider than the viewport, or items visually run into/off the edge) rather than a controlled multi-line header.

**Decision — wrap, not a hamburger drawer.** Per the task brief's explicit steer and the "no new component library, minimal custom components" convention held since M2 (`m2-auth-spec.md` §1: "No dropdown menu needed... two plain elements side by side is enough"), and consistent with the one mobile-responsive precedent already in this app (M4's filter bar, which wraps to a second line rather than collapsing into a drawer), the header should simply be allowed to wrap onto a second line on narrow viewports. A hamburger/slide-out drawer is real new interactive-component surface area (open/close state, focus trap, an icon, a new pattern nothing else in the app uses) that this five-plain-links case does not justify — wrapping is strictly simpler, requires no JS, and matches the design language already established.

**Fix:**

```tsx
<header className="flex flex-wrap items-center justify-between gap-y-2 border-b border-black/[.08] px-4 py-4 dark:border-white/[.145] sm:px-6">
  <Link href="/" className="text-base font-semibold text-foreground">
    RentalTool
  </Link>
  <nav className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm font-medium">
    {/* children unchanged */}
  </nav>
</header>
```

Changes:
- `header`: add `flex-wrap gap-y-2` so, if the brand + nav together ever don't fit one line (shouldn't happen — brand is short), the whole header can wrap without overflowing.
- `nav`: add `flex-wrap justify-end gap-y-2` (keep `gap-4`/`items-center` as the row-gap; Tailwind v4's `gap-4` sets both axes uniformly unless overridden, so explicitly set `gap-x-4 gap-y-2` so wrapped rows aren't spaced as wide vertically as they are horizontally). This is the only change needed to stop overflow: on a narrow viewport the five nav items simply flow onto 2–3 lines, right-aligned, below/next to the wordmark; at `md`+ where they fit, it renders exactly as it does today (one line).
- Also fold in §10's `px-6` → `px-4 sm:px-6` fix here (same edit, same file) — see §10 for why.

No component, no state, no new dependency — a pure Tailwind class change on the existing markup.

## 3. Booking/review row layout collapse on narrow phones — P0

**Files:** `apps/web/src/components/bookings/BookingListingRow.tsx` (shared by `/bookings/mine` and `/bookings/owner-requests`), `apps/web/src/components/bookings/ApproveDeclineButtons.tsx` (unchanged, just the consumer that makes this worst-case).

**Problem — worked example at a 375px-wide phone, worst case (a pending row on `/bookings/owner-requests`, which renders `ApproveDeclineButtons`):**

- Page container: `mx-auto max-w-3xl px-4` → content width `375 − 32 = 343px`.
- Row card: `rounded-2xl border ... p-4` → inner content width `343 − 32 = 311px`.
- Row is `flex items-start gap-4` with three children: thumbnail (`h-20 w-20 shrink-0` = 80px), middle content (`min-w-0 flex-1`), right column (`flex shrink-0 flex-col items-end gap-2` containing `StatusBadge` + `actions`).
- Two `gap-4` (16px) gaps consume 32px.
- Right column's *content* width is driven by `ApproveDeclineButtons`' inner row: `flex gap-2` of two `h-9 px-4` buttons ("Approve" ≈ 90px, "Decline" ≈ 90px) + `gap-2` (8px) ≈ **188px**, and that inner row has no `flex-wrap`, so the right column cannot shrink below ~188px without the button text clipping.
- Remaining width for the middle column (title, date range, price estimate): `311 − 80(thumb) − 32(gaps) − 188(actions) ≈ 11px`.

At ~11px available, the middle column's title (has `truncate`, so it just clips to nothing usable) and the date-range/price-estimate `<p>` tags (**no** `truncate`, so they wrap) render as a nearly unreadable single-character-per-line column — a real, not hypothetical, layout break on common phone widths (this isn't a boundary/edge-case width; 375px is the most common phone viewport in current usage). The same shape (thumb + flex-1 + shrink-0 right column, no wrap) exists on **every** `BookingListingRow` instance — `/bookings/mine` rows are somewhat less bad (right column there is just a `StatusBadge` + a single `Cancel request` text link, ~120px, giving the middle column ~40px — still too tight to read comfortably, just not as catastrophic as the two-button pending-row case).

**Decision — stack to two rows on mobile, restore the current row layout at `sm:` and up**, using `display: contents` to avoid duplicating the component's JSX/props for two different DOM shapes (no new component, same data, same slots).

**Fix — `apps/web/src/components/bookings/BookingListingRow.tsx`:**

Before:
```tsx
<div className="flex items-start gap-4 rounded-2xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-[#0a0a0a]">
  <Link href={`/listings/${listingId}`} className="shrink-0">
    {/* thumb */}
  </Link>
  <div className="min-w-0 flex-1">
    {/* title, date range, estimate, contact */}
  </div>
  <div className="flex shrink-0 flex-col items-end gap-2">
    <StatusBadge status={status} />
    {actions}
  </div>
</div>
```

After:
```tsx
<div className="flex flex-col gap-3 rounded-2xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-[#0a0a0a] sm:flex-row sm:items-start sm:gap-4">
  <div className="flex gap-4 sm:contents">
    <Link href={`/listings/${listingId}`} className="shrink-0">
      {/* thumb — unchanged */}
    </Link>
    <div className="min-w-0 flex-1">
      {/* title, date range, estimate, contact — unchanged */}
    </div>
  </div>
  <div className="flex items-center justify-between gap-2 sm:shrink-0 sm:flex-col sm:items-end sm:justify-start">
    <StatusBadge status={status} />
    {actions}
  </div>
</div>
```

Behavior:
- Below `sm`: outer is `flex-col` → two stacked rows. Row 1 (`flex gap-4`) is thumbnail + title/date/price, same as today, just without competing for width against the actions column. Row 2 is badge (left) + actions (right), full width, `justify-between` — the badge and the Approve/Decline buttons (or Cancel link) each get the full 311px row to lay out in, so the two buttons at ~188px fit comfortably.
- At `sm:` and up: the inner `sm:contents` wrapper "disappears" (its children become direct flex items of the outer row again) and the outer row becomes `sm:flex-row`, reproducing **exactly** today's desktop/tablet layout — thumb, flex-1 middle, shrink-0 right column, all in one row.
- No new component, no prop changes, no JS — three class-list edits on the existing JSX structure (adding one wrapper `div` around the two already-existing children).

**Same pattern, same fix, lower severity — `apps/web/src/components/listings/MyListingCard.tsx`:** identical row shape (thumb + `min-w-0 flex-1` + `shrink-0` right column), but the right column here is only two stacked text links ("Edit"/"Delete", ~50–60px), not two full buttons — so the middle column still gets roughly 140px on a 375px phone (workable, just tight) rather than 11px. Not a break on its own, but it's the same layout family as the row above and should get the identical treatment for consistency between `/listings/mine` and `/bookings/mine`/`/bookings/owner-requests` (a user bouncing between "my listings" and "my bookings" should see the same row-stacking behavior at the same widths, not one that stacks and one that doesn't). Apply the identical before/after edit shown above to this file too (same three class-list changes; `MyListingCard` has no `contact` slot, so the JSX has one fewer child to wrap, but the structure is otherwise the same: thumb + title/details column + actions column).

## 4. Request-to-rent date inputs — don't stack on mobile — P1

**File:** `apps/web/src/components/bookings/RequestToRentForm.tsx`

Current: the Start date / End date fields are in a bare `<div className="flex gap-3">` — no `flex-col`/`sm:flex-row`, unlike every other multi-field row in the app that was built with mobile in mind (the M4 filter bar). On a 375px phone: page container (`max-w-3xl px-4`) → 343px, panel (`rounded-2xl border p-4`) → 311px, minus `gap-3` (12px) → 299px ÷ 2 ≈ **150px per date input**. At 320px (iPhone SE-class) this drops to ≈122px per field. Native `<input type="date">` can render at these widths, but it's materially tighter than every other input in the app and is the one place in this page that doesn't follow the app's own established "stack on mobile" precedent — worth fixing for consistency and breathing room even though it isn't a hard break like §3.

**Fix:**

Before:
```tsx
<div className="flex gap-3">
  <div className="flex flex-1 flex-col gap-1"> {/* start_date */} </div>
  <div className="flex flex-1 flex-col gap-1"> {/* end_date */} </div>
</div>
```

After:
```tsx
<div className="flex flex-col gap-3 sm:flex-row">
  <div className="flex flex-1 flex-col gap-1"> {/* start_date — unchanged */} </div>
  <div className="flex flex-1 flex-col gap-1"> {/* end_date — unchanged */} </div>
</div>
```

Below `sm`, the two date fields stack full-width (each gets the panel's full ~311px, comfortable); at `sm:` and up they return to the current side-by-side row (panel is inside `max-w-3xl`, so at `sm` (640px) there's ample width — `640 − 32(page) − 32(panel) = 576px`, ÷2 = 288px per field, no cramping at all at that width). Exactly the same breakpoint the app's filter bar already uses for its own field-stacking decision.

## 5. Listing form price/unit row — same problem, worse — P1

**File:** `apps/web/src/components/listings/ListingForm.tsx`

Current: `<div className="flex gap-3">` wraps the Price and Per (unit) fields, used identically on `/listings/new` and `/listings/[id]/edit`. This card is `max-w-md p-8` (wider padding than the booking panel above), inside a `px-4` page wrapper. At 320px: `320 − 32(page px-4) − 64(card p-8) = 224px`, minus `gap-3` (12px) = 212px ÷ 2 ≈ **106px per field**. The Price field is a bordered box (`px-3 py-2`) containing a `$` label + `gap-2` + the number input — after that box's own internal padding/gap/glyph (~24 + 8 + 10 ≈ 42px overhead), the actual number input gets roughly **64px** of usable width at 320px, not enough to comfortably show a value like `125.00` without the box already feeling cramped/clipped. This is the single tightest input in the app at phone widths.

**Fix:**

Before:
```tsx
<div className="flex gap-3">
  <div className="flex flex-1 flex-col gap-1"> {/* price_amount */} </div>
  <div className="flex flex-1 flex-col gap-1"> {/* price_unit */} </div>
</div>
```

After:
```tsx
<div className="flex flex-col gap-3 sm:flex-row">
  <div className="flex flex-1 flex-col gap-1"> {/* price_amount — unchanged */} </div>
  <div className="flex flex-1 flex-col gap-1"> {/* price_unit — unchanged */} </div>
</div>
```

Identical fix/rationale to §4 — same breakpoint, same pattern, now applied consistently everywhere a two-field row exists in the app (filter bar already did this; date row and price row now match it too).

## 6. Interactive star-rating tap targets — P1

**File:** `apps/web/src/components/reviews/StarRating.tsx`

In `interactive` mode (used only by `ReviewForm`), each star renders as a bare `<button type="button">{glyph}</button>` with no padding — at `size="md"` (`text-lg`, 18px line-height) the actual clickable box is roughly 18×18px, well under the ~44px touch-target guideline, and the five buttons sit directly adjacent with no gap between them (`inline-flex` on the parent `<span>`, no `gap`), making mis-taps between adjacent stars likely on a real touchscreen. This is the one place in the app where a touch target is small enough to flag as a genuine usability problem (not just "smaller than ideal" like the app's general `py-2` inputs — those are ~36px and merely below the guideline; this is ~18px and materially hard to tap precisely).

**Fix:** add per-star padding and a small gap, only in interactive mode, without changing the visual glyph size (so read-only star rows elsewhere — the aggregate line, review list — are untouched):

```tsx
<span className={`inline-flex ${sizeClass} leading-none ${interactive ? "gap-0.5" : ""}`} aria-label={...}>
  {stars.map((n) => {
    ...
    if (interactive) {
      return (
        <button
          key={n}
          type="button"
          onClick={() => onChange?.(n)}
          aria-label={`Rate ${n} star${n === 1 ? "" : "s"}`}
          className={`${colorClass} cursor-pointer p-1.5 -m-1.5`}
        >
          {glyph}
        </button>
      );
    }
    ...
  })}
</span>
```

`p-1.5` (6px) pushes each button's hit target to roughly 30×30px at `size="md"`; `-m-1.5` cancels the added padding's effect on visual spacing/layout so the star row doesn't visibly grow or reflow anything around it (net-zero layout footprint, larger tap target). Combined with `gap-0.5` between buttons this meaningfully reduces mis-taps without redesigning the control.

## 7. Empty-state container spacing drift — P1

**File:** `apps/web/src/app/bookings/owner-requests/page.tsx`

Every other empty-state container in the app (`/listings` platform-empty and filtered-empty, `/listings/mine`, `/bookings/mine`) uses `flex flex-col items-center gap-4 rounded-2xl border border-black/[.08] py-16 text-center dark:border-white/[.145]`. The owner-requests page's empty state (its `bookings.length === 0` branch) uses `gap-2` instead of `gap-4`:

```tsx
// current — apps/web/src/app/bookings/owner-requests/page.tsx
<div className="mt-8 flex flex-col items-center gap-2 rounded-2xl border border-black/[.08] py-16 text-center dark:border-white/[.145]">
```

**Fix:** change `gap-2` → `gap-4` to match every other instance of this container in the app:

```tsx
<div className="mt-8 flex flex-col items-center gap-4 rounded-2xl border border-black/[.08] py-16 text-center dark:border-white/[.145]">
```

(The tighter sub-section "no pending requests yet" / "no past requests yet" one-line notes inside the Pending/History sections on the same page are a *different*, intentionally lighter treatment — plain `<p className="mt-2 text-sm text-zinc-500...">`, no border/container — which is fine as-is; that's a sub-list-within-a-page empty note, not a full-page empty state, and doesn't need to match the bordered container pattern. Only the page-level empty state's `gap-2` is the actual drift.)

## 8. Button-height inconsistency — P1

Three different heights are in use across the app for what are all, functionally, "primary filled action buttons" — not random, but not fully reconciled either:

| Height | Used for | Files |
|---|---|---|
| `h-11` | Full-width form submits (the form *is* the primary action on the page) | signup/login submit, `ProfileForm` save, `ListingForm` publish/save, `RequestToRentForm` submit/login-link |
| `h-10` | Standalone CTA buttons/links not inside a dense row (page-header or empty-state actions) | `/listings` "Apply filters", `/listings/mine` "+ New listing", `/bookings/mine` "Browse listings" |
| `h-9` | Compact actions inside a tight inline row/card | Header "Sign up"/"Log out", `ApproveDeclineButtons` Approve/Decline, `ReviewForm` "Submit review" |

The `h-11`/`h-10` split is defensible (full-page-submit vs. standalone-CTA) and not worth unifying — changing it would touch nearly every form in the app for no real user-facing benefit, which this milestone's non-goals explicitly rule out. The `h-9` tier is the one worth a targeted bump: at 36px it's the app's shortest button, and two of its three uses — **Approve/Decline** on `/bookings/owner-requests` and **Submit review** in `ReviewForm` — are meaningful, one-tap-consequence primary actions on a touch-first flow, not incidental chrome like the header's "Log out". Bumping just those to `h-10` closes most of the gap to the 44px guideline with a one-class change and no layout risk (their containing rows already have slack — see §3's fix, which gives the actions row the full card width on mobile).

**Fix:**
- `apps/web/src/components/bookings/ApproveDeclineButtons.tsx`: both buttons, `h-9` → `h-10`.
- `apps/web/src/components/reviews/ReviewForm.tsx`: `PRIMARY_BUTTON` constant, `h-9` → `h-10` (also affects nothing else — it's only used once in this file).
- Leave the header's `h-9` "Sign up"/"Log out" buttons as-is — chrome-level, low-consequence, low-frequency actions; not worth the churn for this pass. Documented here explicitly so it's a deliberate call, not an oversight.

## 9. Header padding / long-name safety — P2

**File:** `apps/web/src/components/Header.tsx`

- **Padding drift:** the header uses `px-6`; essentially every page content container in the app (`/listings`, `/listings/mine`, `/bookings/mine`, `/bookings/owner-requests`, the auth/listing form wrappers) uses `px-4` at the base with no `sm:` override. The header is the one place with wider horizontal padding than the content below it, which reads as slightly misaligned on any viewport once you compare the wordmark's left edge to, say, "Browse listings" `<h1>` on the page below it. Folded into §2's fix already (`px-4 py-4 sm:px-6` — keeps a bit of extra breathing room at wider viewports where the header has room to spare, while matching `px-4` at the width where every content container also uses it).
- **Long name safety:** `{fullName || "Account"}` renders with no width cap. A long `full_name` (a real, user-controlled value from the M2 profile form, no length limit enforced there) can stretch the nav row further than the five-item budget already assumes. Cap it defensively:

```tsx
<Link href="/profile" className="max-w-[10rem] truncate text-foreground hover:underline">
  {fullName || "Account"}
</Link>
```

`max-w-[10rem]` (160px) comfortably fits typical two-word names while preventing a pathological long value from pushing the wrap point earlier than necessary or, at `md`+ where wrapping doesn't trigger, from visually dominating the row.

## 10. Verified — no fix needed

To be explicit about what was checked and found fine (so this isn't read as an incomplete audit):

- **Filter bar (`/listings`, M4):** shipped code matches `m4-search-spec.md` §11 exactly — `flex flex-col gap-3` base, `sm:flex-row sm:flex-wrap sm:items-end sm:gap-3`, each field `w-full sm:w-40`/`sm:w-24`, price min/max/unit trio kept together in its own `flex w-full items-end gap-2 sm:w-auto` sub-row, Apply/Clear both full-width on mobile. No drift found.
- **Card grid (`/listings`):** `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` inside a `max-w-5xl` container. Checked from 320px (1 col, comfortable) up through desktop — since the container caps at `max-w-5xl` (1024px, which is also exactly the `lg` breakpoint), the grid never needs a 4th column tier; 3 columns at ≥1024px stay a sensible ~320px card width and don't get stretched thin or overly wide at larger monitors. No fix needed.
- **Listing detail page image gallery:** hero image (`aspect-video w-full rounded-2xl object-cover`) and the thumbnail strip (`flex gap-2 overflow-x-auto`) both work correctly at phone widths — the strip scrolls horizontally rather than wrapping or overflowing the viewport. No fix needed.
- **Listing detail page content order:** title → price → category/location → rating → description → owner → request-to-rent panel → reviews is a single-column stack at every width (no sidebar to reflow), so nothing gets pushed further down on mobile than on desktop — the order is identical at all widths by construction. No fix needed.
- **Title/description/name overflow:** `ListingCard`, `MyListingCard`, and `BookingListingRow` titles all correctly pair `truncate` with an ancestor `min-w-0` (required for `truncate` to work inside a flex item — verified present in all three, not just assumed). The listing detail page's own `<h1>` has no `truncate` but doesn't need one — it's alone in a wrapping flex row (`items-start justify-between gap-4`) with only a `shrink-0` sibling ("Edit listing"), so a long title simply wraps to multiple lines rather than overflowing. Reviewer names in `ReviewsList` are pre-shortened to "First L." server-side (`displayName()`), so they're short enough not to be a realistic overflow risk. No fix needed.
- **Dark mode:** spot-checked every file touched by this audit for `dark:` variant pairing (border, background, text-color classes) — no missing/orphaned `dark:` class found; the app's existing dark-mode support is intact and untouched by any fix above (none of the fixes in this spec change color classes, only layout/spacing/height classes).
- **Card border-radius/border treatment:** `rounded-2xl border border-black/[.08] dark:border-white/[.145]` is used consistently on every card/row/panel/empty-state container across M3–M6 (`ListingCard`, `MyListingCard`, `BookingListingRow`, review cards, the filter bar panel, `RequestToRentForm`'s panel, all empty states). No drift found beyond the single `gap-2`/`gap-4` spacing issue already noted in §7.

## 11. Non-goals (explicit)

- **No new features, no new pages, no new routes.** Every file touched above already exists; every fix is a class-list (or, in §6, a small structural wrapper `div` + `contents` utility) change to existing markup.
- **No visual rebrand / new color palette / new spacing scale.** All fixes reuse colors, radii, and spacing values already present elsewhere in the app (the filter bar's mobile-stack breakpoint, the existing card/empty-state container classes, the existing button-height tiers).
- **No component library adoption.** Still plain Tailwind utility classes throughout; the one non-trivial technique used (`sm:contents` in §3) is a stock Tailwind/CSS utility, not a new dependency or abstraction.
- **No RLS/schema/business-logic changes.** Nothing in this spec touches a server action, a query, a migration, or any data shape — purely presentational/layout class changes.
- **No mobile native app (Expo) work.** Out of scope per M8; this spec is `apps/web` only.
- **No dark-mode redesign.** Existing `dark:` variants are verified intact (§10) and untouched by every fix; no new dark-mode behavior is introduced.
- **§3's home-page fix is a minimal branded landing, not a new marketing page.** Replace the `create-next-app` boilerplate content with: the app's existing header/palette/spacing, a one-line value-prop heading, and two links reusing existing routes (`/listings` "Browse listings", `/signup` "Get started" — mirroring the button styles already established for primary/secondary actions elsewhere in the app, e.g. `ProfileForm`'s primary button and the header's secondary "Log in"-style link). No new imagery, no new copy system, no illustration/marketing asset work — this is scoped as "stop shipping the framework's default template," not as new landing-page design work. Also fix `app/layout.tsx`'s `metadata` (`title`/`description`) away from the default "Create Next App" values to "RentalTool" / a one-line description, since that's the same class of leftover-boilerplate issue and costs one line to fix alongside it.

## 12. Copy reference

No user-facing copy changes anywhere in this spec **except**:
- `app/layout.tsx` metadata: `title: "Create Next App"` → `"RentalTool"`; `description: "Generated by create next app"` → a one-line description, e.g. `"Rent tools from people near you in the GTA."` (exact wording not load-bearing, engineer's call within that spirit).
- `app/page.tsx` (home): replace the boilerplate heading/body/links with a minimal branded equivalent per §11's scope note above — exact heading copy is the implementing engineer's reasonable call (e.g. "Rent the tool you need, from someone nearby." + a one-line subhead), not specified further here since it's not a new information architecture decision, just de-boilerplating.

Every other fix in this spec (§2–§9) is layout/spacing/sizing only — no strings change.

## 13. Styling notes

- Reuses, does not replace, every convention already documented in `m2-auth-spec.md` §7, `m3-listings-spec.md` §9, `m4-search-spec.md` §14, `m5-booking-spec.md` §12, `m6-reviews-spec.md` §12.
- The one new *technique* introduced (not a new visual style) is `sm:contents` for collapsing a two-child wrapper back into its parent's flex flow above a breakpoint (§3) — used because it lets a row's DOM stay single-source (same JSX, same props, same slots) while rendering two different shapes at two breakpoints, rather than maintaining two parallel layouts or adding a client-side width-detection component.
- Priority order for implementation, if sequenced: §2 (header) and §3 (booking rows) first — both are real, common-viewport breakages, not polish. §3's home-page fix next (highest visibility, zero risk). §4/§5 (date/price row stacking) and §6 (star tap targets) next. §7 (empty-state drift), §8 (button heights), §9 (header padding/name safety) last — smallest visual impact, safe to batch together.

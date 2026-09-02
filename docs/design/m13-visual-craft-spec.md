# M13 — Visual Craft & Polish Pass (Punch List)

Status: ready for implementation
Scope: `apps/web` only. This is a **retrofit onto shipped, reviewed, QA'd functionality** —
no new features, no new routes, no schema changes (that is M14's territory, running in
parallel on `feature/m14-robustness`; this spec does not duplicate or second-guess it).
It composes with M12 (`m12` design-system tokens — already shipped, confirmed by reading
`globals.css` and every component below) and M7 (`m7-ui-polish-spec.md` — responsive/layout
fixes, already shipped) rather than redoing either. Every fix below is additive craft:
loading feedback, empty-state personality, micro-interactions, one narrowly-scoped icon
dependency, a placeholder upgrade, and a feedback-consistency cleanup — on top of markup
M7 already made responsive and colors/type M12 already tokenized.

## 0. Method

Read every page/component in `apps/web/src/app` and `apps/web/src/components` fresh (not
just the M12/M7 specs, which describe intent — both already shipped, so this reads the
actual current code), confirmed:

- **Zero `loading.tsx` files exist anywhere in the app** (`apps/web/src/app/**/loading.tsx`
  — glob returns nothing).
- **Zero icon-related imports exist anywhere** (`grep -r "lucide|react-icons|heroicons|
  @radix-ui|iconify"` across `apps/web` — no matches). The app is 100% text/Unicode-glyph
  today (star ratings use literal `★`/`☆`, the photo-remove control uses a literal `×`
  character).
- M12's tokens (`--primary`, `--surface`, `--surface-muted`, `--line`, `--line-strong`,
  the semantic `success`/`warning`/`danger` triads) are live in `globals.css` and used
  consistently everywhere already — this pass sources every new class from those same
  tokens, introduces zero new colors.
- M7's responsive fixes (`sm:contents` row-stacking, `flex-wrap` header, tap-target
  padding on `StarRating`, the two-field mobile-stack pattern) are all still present and
  untouched by anything below.

## 1. Loading states

### 1.1 Per-action audit (button/form submit feedback)

| Action | File | Current state | Verdict |
|---|---|---|---|
| Create/update listing | `ListingForm.tsx` | `submitting`/`uploading` state tracked; button label flips to "Publishing…"/"Saving…", `disabled:opacity-50` | Already surfaced correctly — verified visually wired, not just tracked in state. No gap. |
| Request to rent | `RequestToRentForm.tsx` | button → "Sending request…", disabled | No gap. |
| Submit review | `ReviewForm.tsx` | button → "Submitting…", disabled | No gap. |
| Approve/Decline | `ApproveDeclineButtons.tsx` | each button independently → "Approving…"/"Declining…", `disabled={pending !== null}` locks both while either is in flight | No gap. |
| Cancel booking | `CancelBookingButton.tsx` | text link → "Cancelling…", disabled | No gap. |
| Delete listing | `ListingForm.tsx`'s `DeleteListingLink` | text link → "Deleting…", disabled | No gap. |
| Delete listing (list row) | `MyListingCard.tsx` | text link → "Deleting…", disabled | No gap. |
| Save profile | `ProfileForm.tsx` | `useFormStatus().pending` → "Saving…", disabled | No gap. |
| Log in | `LoginForm.tsx` | button → "Logging in…", disabled | No gap. |
| Sign up | `signup/page.tsx` | button → "Signing up…", disabled | No gap. |

**Finding: every async action in the app already has a text-label + disabled-state loading
treatment — there is no "blank flash / frozen-looking button" gap anywhere.** This is
good news, not a hedge: it means this pass's loading-state work is pure craft upgrade
(add a visual spinner alongside the existing label change), not gap-filling.

**Decision — add a shared inline spinner to every *filled/outlined button* loading state**
(not to plain text-link actions like Cancel/Delete/DeleteListingLink, where a spinner next
to underlined text reads as visual clutter disproportionate to the control's weight — the
text-change alone is the right amount of ceremony there, and that split itself is a
deliberate, worth-documenting distinction: filled buttons get a spinner, text links get
label-only). New component:

```tsx
// components/ui/Spinner.tsx
import { Loader2 } from "lucide-react";

export default function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} aria-hidden="true" />;
}
```

Applied inside the button, before the label, only while pending:

```tsx
<button ... className={PRIMARY_BUTTON}>
  {submitting && <Spinner className="mr-2 h-4 w-4" />}
  {submitting ? "Sending request…" : "Request to rent"}
</button>
```

**Files touched:** `ListingForm.tsx` (submit button), `RequestToRentForm.tsx` (submit +
the logged-out login-link stays text-only, no spinner — it's not actually submitting
anything), `ReviewForm.tsx` (submit button), `ApproveDeclineButtons.tsx` (both buttons,
spinner only on whichever one is `pending`), `ProfileForm.tsx`'s `SaveButton`,
`LoginForm.tsx`, `signup/page.tsx`. Seven files, one shared primitive, `Tailwind`'s
built-in `animate-spin` utility — no new CSS.

### 1.2 Navigation-transition skeletons (`loading.tsx`) — the real decision

**Why there's a real gap here even though every *in-page* action is covered:** this app
has no client-side data-fetching library — every page is a Server Component that queries
Supabase during the server render, so there is no "loading" moment for, e.g., typing a URL
directly. But **there is a real, currently-unhandled gap during client-side navigation**
(clicking a `<Link>` from one route to another): Next's router shows nothing but the
*previous* page, frozen, until the new route's server render completes and streams back —
for a page that runs 2–4 sequential Supabase queries (listing rows → cover-image lookup →
signed-URL generation, sometimes more), that's a real, felt delay with zero feedback today.
Next.js's `loading.tsx` file convention (an automatic Suspense boundary per route segment)
is purpose-built for exactly this and costs nothing at build/runtime beyond the skeleton
markup itself.

**Decision: yes, add `loading.tsx` to the five list/detail-shaped routes that run
multi-query server fetches, reusing one shared skeleton primitive so the marginal cost per
route is small.** Not added to `/login`, `/signup`, `/profile` (single-row query, small
centered card, sub-100ms in practice, low perceived-latency value) or `/` (fully static,
zero data fetch — a skeleton here would be pure theater).

New shared primitive:

```tsx
// components/ui/Skeleton.tsx
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-surface-muted ${className}`} />;
}
```

**`app/listings/loading.tsx` (new)** — grid of card-shaped skeletons matching
`ListingCard`'s actual shape (`aspect-square` image block + 3 text lines), same
`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` / `max-w-5xl` container as the real page, 6
placeholder cards (fills the first viewport at every breakpoint without over-rendering):

```tsx
import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-12">
      <Skeleton className="mb-8 h-8 w-48" />
      <Skeleton className="mb-6 h-32 w-full" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-line">
            <Skeleton className="aspect-square w-full rounded-none" />
            <div className="flex flex-col gap-2 p-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**`app/listings/[id]/loading.tsx` (new)** — hero image block + title/price/meta lines +
description lines, matching the detail page's actual stack:

```tsx
import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
      <Skeleton className="aspect-video w-full" />
      <Skeleton className="mt-6 h-8 w-2/3" />
      <Skeleton className="mt-2 h-5 w-24" />
      <Skeleton className="mt-2 h-4 w-1/3" />
      <div className="mt-6 flex flex-col gap-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}
```

**`app/listings/mine/loading.tsx`, `app/bookings/mine/loading.tsx`,
`app/bookings/owner-requests/loading.tsx` (all new)** — identical row-skeleton shape
(these three pages all render the same thumb+lines+action row shape via
`BookingListingRow`/`MyListingCard`), 4 placeholder rows:

```tsx
import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
      <Skeleton className="mb-8 h-8 w-48" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-4 rounded-2xl border border-line p-4">
            <Skeleton className="h-20 w-20 shrink-0 rounded-lg" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

Six new files total (one shared primitive + five route skeletons), zero logic, zero data
fetching of their own — pure static markup that Next.js swaps in automatically during the
Suspense-boundary window and swaps back out the instant the real page's data resolves.

## 2. Empty states

### 2.1 Full inventory

Grepped for the established `rounded-2xl border ... py-16 text-center` container — exactly
**5 instances**, all confirmed by reading the surrounding code:

| # | File | Context | Current copy |
|---|---|---|---|
| 1 | `app/listings/page.tsx` | filtered-empty (`hasActiveFilter`) | "No tools match your filters." / "Try adjusting your search." + Clear filters link |
| 2 | `app/listings/page.tsx` | platform-empty (no listings at all) | "No listings yet." + "Be the first to list a tool!" link |
| 3 | `app/listings/mine/page.tsx` | owner has no listings | "You haven't listed any tools yet." + "+ New listing" button |
| 4 | `app/bookings/mine/page.tsx` | renter has no bookings | "You haven't requested to rent anything yet." + "Browse listings" button |
| 5 | `app/bookings/owner-requests/page.tsx` | owner has zero requests ever | "No booking requests yet." / "Requests to rent your listings will show up here." |

(Sub-list empty notes — `ReviewsList`'s "No reviews yet…", owner-requests' "No pending
requests."/"No past requests yet." — are a deliberately lighter, borderless, plain-`<p>`
treatment per M7 §7's explicit call; not touched here, still correct as a different,
intentionally-quieter tier for a sub-section-within-a-page rather than a full empty page.)

### 2.2 Assessment — "intentional" or "plain text in a box"?

All 5 read as the latter today: a bordered box, one or two lines of gray-ish text, and a
link/button — functionally clear, visually inert. Nothing distinguishes "no results because
you filtered too narrowly" from "no results because nobody has listed anything yet" except
the copy; there's no visual anchor at all.

**Decision: add one small icon per empty-state context**, via `lucide-react` (see §4 for
the full dependency decision). Each icon sits in a muted circular badge above the existing
text — same container shape, same copy, same action link/button, just a considered visual
anchor instead of a bare box:

```tsx
// components/ui/EmptyState.tsx
import type { LucideIcon } from "lucide-react";

export default function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children?: React.ReactNode; // action link/button
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-line py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted">
        <Icon className="h-6 w-6 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-foreground">{title}</p>
        {description && <p className="text-sm text-zinc-500 dark:text-zinc-400">{description}</p>}
      </div>
      {children}
    </div>
  );
}
```

This also collapses 5 hand-repeated copies of the container class string into one shared
component — a real DRY win alongside the visual one, in the same spirit as `StatusBadge`/
`BookingListingRow` already being shared primitives.

**Icon-per-context mapping** (each a deliberate, non-arbitrary match, not decoration for
its own sake):

| Empty state | Icon | Why |
|---|---|---|
| `/listings` filtered-empty | `SearchX` | Directly signals "your search found nothing," distinct from "nothing exists" |
| `/listings` platform-empty | `PackageSearch` | Signals "no inventory yet" without implying anything is broken |
| `/listings/mine` | `Wrench` | Ties to the app's tool-rental identity; "you haven't listed a tool" |
| `/bookings/mine` | `CalendarClock` | Bookings are date-range-based; reads as "no rental activity yet" |
| `/bookings/owner-requests` | `Inbox` | "Nothing has come in yet" — an inbox-shaped empty state is a widely
understood convention |

No copy changes — every existing string is preserved verbatim, only the container markup
changes (plain text/link children become `<EmptyState>` props).

## 3. Micro-interactions

### 3.1 Buttons — verified consistent, no gap

Primary (`bg-primary ... hover:bg-primary-hover active:bg-primary-active
transition-colors`), secondary-outline (`border-line ... hover:bg-surface-muted
transition-colors`), and destructive (`text-danger hover:underline` / outlined variant
`hover:bg-danger-bg transition-colors`) all confirmed present with `transition-colors` on
every instance app-wide (`ListingForm`, `RequestToRentForm`, `ReviewForm`,
`ApproveDeclineButtons`, `Header`, home page, `/listings` filter form,
`/listings/mine`/`/bookings/mine` empty-state actions). No fix needed here — M12 already
landed this consistently.

### 3.2 Cards / rows — a real decision, not a blanket hover

**`ListingCard.tsx`** is the one card that is a *single* clickable target (the entire
card is one `<Link>`, no independent interactive children) — its `hover:shadow-md` (M7)
is correct and stays.

**`BookingListingRow.tsx` and `MyListingCard.tsx`** are rows containing *multiple*
independent actions (a thumbnail link, a title link, and separate Approve/Decline/Cancel/
Edit/Delete controls) — per the task brief's own framing, a whole-row hover effect here
would visually suggest "click anywhere on this row" when several *different* things happen
depending on exactly where you click. **Decision: no whole-row hover treatment added to
either.** This is deliberate, not an oversight — documented here so it reads as a
considered call rather than a gap.

**Review cards (`ReviewsList.tsx`'s individual review `<div>`)** are not clickable at all
(no link, no button inside) — correctly static, no hover needed, no change.

### 3.3 Focus-visible — the actual gap found

M12 §4.9 added `focus-visible` rings to every *button-styled* interactive element
(primary/secondary/destructive buttons, accent text-links using the §4.2 treatment,
inputs, the interactive star buttons) — verified present everywhere that pattern was
applied. But **plain navigational `<Link>`s that aren't styled as buttons were missed**,
confirmed by reading the actual markup:

| Element | File | Current | Fix |
|---|---|---|---|
| Wordmark link (`RentalTool` → `/`) | `Header.tsx` | `text-base font-semibold text-accent`, no focus ring, no hover state at all | Add `hover:text-accent-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm` |
| Nav links (Browse listings / My listings / Bookings / account name / Log in) | `Header.tsx`, 5 instances | `hover:text-primary hover:underline underline-offset-2`, no focus ring | Add the same `focus-visible:*` block used everywhere else in the app |
| Whole-card link | `ListingCard.tsx` | `hover:shadow-md`, no focus ring — this is the single largest, highest-traffic clickable target in the app (`/listings` grid) with zero keyboard-focus indicator | Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background` |
| Title link | `BookingListingRow.tsx` | `hover:underline`, no focus ring | Add the standard ring |
| Title link | `MyListingCard.tsx` | `hover:underline`, no focus ring | Add the standard ring |

This is additive-only (identical to how M12 §4.9 was scoped) — changes nothing about
mouse/default appearance, only what renders on keyboard focus. Six files.

**Adjacent observation, not fixed here (out of this pass's class-list-only scope):**
`BookingListingRow`/`MyListingCard` each render two separate `<Link>`s to the identical
`href` right next to each other (the thumbnail wrapper and the title) — a keyboard/
screen-reader user tabs through the same destination twice in a row. Flagging this because
it surfaced during the focus-audit above, but fixing it means changing which element is
focusable (e.g. `tabIndex={-1}` + `aria-hidden` on the thumbnail link), which is
markup/semantics work adjacent to M14's robustness scope, not a className-only visual fix
— left as a note, not a punch-list item.

## 4. Iconography — decision

**Yes, add `lucide-react`.** Tree-shakeable (each icon is its own ES import, unused icons
never ship), MIT-licensed, zero runtime dependency beyond the icons actually imported,
and it's the standard modern choice for exactly the "minimal, non-decorative" aesthetic
M12 already established (thin-stroke line icons, no filled/glyph style that would clash
with the app's flat, borderless-panel visual language).

**Scope — narrower than the task brief's full candidate list, by design:**

| Candidate location (from the brief) | Decision | Why |
|---|---|---|
| Loading spinners | **Yes** — `Loader2` | Real craft gap (§1.1), zero-ambiguity mapping |
| Empty-state icons | **Yes** — 5 mapped icons (§2.2) | Real craft gap, one considered icon per state, not decorative noise |
| Photo-remove control | **Yes** — swap the literal `×` character for `X` at the same size | Not decorative — replaces an existing ad-hoc glyph (inconsistent rendering across fonts/OSes) with a proper vector icon; zero new surface area |
| Listing image placeholder | **Yes** — see §5 | Direct instruction to evaluate this specifically |
| Nav items (Browse listings / My listings / Bookings / account) | **No** | 4–5 nav items with icons added would be decorative, not informational — text labels are already unambiguous, and pairing every nav item with an icon this app has never used before adds visual noise to the app's most-seen chrome for no comprehension gain |
| Status badges (pending/approved/declined/cancelled) | **No** | The color+label pill already unambiguously communicates status (M12 §1.4); a checkmark/x glyph on a `px-2.5 py-0.5` pill is proportionally large clutter relative to the control, and risks visually competing with the review star icons nearby on the same page |
| Category filter dropdown/values (14 categories) | **No** | Two compounding reasons: (1) native `<select>` elements can't reliably render inline icons in most browsers' own option-list UI — this would require building a custom dropdown component, which is out of scope ("no new component library," M2's own "two plain elements is enough" precedent, and this milestone's explicit "no new features" boundary); (2) even setting that aside, 14 categories is a real per-category icon-curation and-maintenance burden for an MVP, with several categories (e.g. "Party & Event," "Moving & Hauling") having no obvious 1:1 icon match — a mismatched or arbitrary-feeling icon set is worse than no icon set |
| Star ratings | **No** — stays Unicode `★`/`☆` | M12 already made this exact call explicitly (`design-system.md` §5 "Reviewers can view their own reviews" note / `StarRating.tsx`'s own doc comment: "zero new dependency"); replacing a working, already-correct primitive with a new icon dependency for the same visual result is scope creep, not craft |

Net new icon imports used: `Loader2`, `SearchX`, `PackageSearch`, `Wrench`, `CalendarClock`,
`Inbox`, `X`, plus whatever §5 picks for the placeholder (`Wrench`, reused). Eight distinct
icons, all tree-shaken individually — this is a genuinely small footprint, not "add an
icon library and sprinkle icons everywhere."

**`package.json`:** add `"lucide-react": "^0.5xx"` (implementer pins the current stable
version at merge time) to `apps/web/dependencies`. This is the one new-dependency decision
available in this pass, per the task's own constraint.

## 5. Listing image placeholder

**File:** `components/listings/ImagePlaceholder.tsx`

**Current:** a flat `bg-zinc-100 dark:bg-zinc-900` box showing the listing title's first
letter in `text-2xl font-semibold text-zinc-400 dark:text-zinc-600` — M3's original,
explicitly-scoped "no stock photo, no external placeholder service" decision.

**Decision: replace the bare initial letter with a centered generic `Wrench` icon**, and
move the container onto the app's now-real elevation tokens (`bg-surface-muted` +
`border border-line`, upgrading it from a flat, un-bordered gray box to match every other
placeholder/panel surface in the app):

```tsx
import { Wrench } from "lucide-react";

export default function ImagePlaceholder({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center border border-line bg-surface-muted ${className}`}
    >
      <Wrench className="h-8 w-8 text-zinc-400 dark:text-zinc-500" strokeWidth={1.5} aria-hidden="true" />
    </div>
  );
}
```

**Assumption, stated explicitly:** this drops the `label` prop (the initial-letter source)
entirely — every call site (`ListingCard`, `MyListingCard`, `BookingListingRow`,
`app/listings/[id]/page.tsx`) currently passes `label={listing.title}` and can simply stop.
The initial letter never actually communicated anything about the tool (it's just the
title's first character — often an article like "A"/"D" for "A Drill"/"DeWalt…"), whereas
a single universal wrench glyph reads as an intentional, branded "no photo" state across
every context (grid card, row thumbnail, detail hero) the same way it would in any polished
marketplace app. One fixed icon size (`h-8 w-8`, 32px) is used regardless of container size
— a centered glyph inside a variable-size frame is the standard "no image" pattern (the
icon doesn't need to scale with the box to read correctly, the same way a generic broken-
image icon doesn't scale with an `<img>`'s dimensions). Still zero network dependency:
`lucide-react` icons are inline SVG React components, bundled at build time, no different
in kind from the Unicode character it replaces — the M3 "no external image service, no
stock photos" constraint is fully preserved.

**Call sites to update (drop the now-unused `label` prop):** `ListingCard.tsx`,
`MyListingCard.tsx`, `BookingListingRow.tsx`, `app/listings/[id]/page.tsx`. Four files,
one-line prop removal each.

## 6. Feedback consistency (success/error messaging)

### 6.1 The two established, genuinely-consistent conventions

Reading every success/error message in the app surfaces **two real, distinct, both-correct
conventions** — not drift, once separated correctly:

1. **State-confirmation banner** (`rounded-lg bg-{success,danger}-bg px-4 py-3 text-sm
   text-{success,danger}-foreground`): used for messages that greet you on arrival at a
   page — via a redirect + query param, or (see §6.2) a same-page action that just
   succeeded. Confirmed instances: `bookings/mine`'s `requestSent` banner,
   `LoginForm`'s `confirmError` banner, `ProfileForm`'s `justConfirmed` banner.
2. **Plain inline validation/submit-error text** (`text-sm text-danger`, no box): used for
   every in-form validation error and submit-failure message across the entire app —
   `LoginForm`, `signup/page.tsx`, `ListingForm.tsx` (both the form-level error and the
   `photoNote` warning), `RequestToRentForm.tsx` (date-validation + submit error),
   `ReviewForm.tsx`, `ApproveDeclineButtons.tsx`, `CancelBookingButton.tsx`,
   `DeleteListingLink` (in `ListingForm.tsx`). Confirmed consistent across all nine.

Both are legitimate, intentional, different-purpose treatments (arrival-context banner vs.
inline action-feedback text) — this pass does **not** unify them into one style; that
would actually reduce clarity, not add it.

### 6.2 The one real drift found

`ProfileForm.tsx` is the only form in the app whose successful submit **doesn't redirect**
(every other successful submit elsewhere navigates to a different page — create/update
listing → detail page, request booking → `/bookings/mine?requestSent=1`, signup-with-
session → `/profile`, delete → `/listings/mine`). Because it stays in place, its
`state.status === "success"` message is semantically the same *category* of message as the
three banners in §6.1 (an unambiguous "this succeeded" confirmation) but is currently
rendered as plain `text-sm text-success` — no box, drifted from the pattern.

`signup/page.tsx`'s `confirmationPending` message has the identical shape (a same-page,
non-redirect success state) and the identical drift — plain `text-sm text-success`.

**Fix — exact before/after:**

`apps/web/src/app/profile/ProfileForm.tsx` line ~135-137:
```tsx
// before
{state.status === "error" && <p className="text-sm text-danger">{state.message}</p>}
{state.status === "success" && (
  <p className="text-sm text-success">{state.message}</p>
)}

// after
{state.status === "error" && (
  <p className="rounded-lg bg-danger-bg px-4 py-3 text-sm text-danger-foreground">{state.message}</p>
)}
{state.status === "success" && (
  <p className="rounded-lg bg-success-bg px-4 py-3 text-sm text-success-foreground">{state.message}</p>
)}
```
(Both branches move to the banner treatment together — the success/error pair should be
visually paired, and `ProfileForm`'s error here is the same "outcome of the save action
that just ran" category as its success sibling, not a field-level validation error like
the other eight instances in §6.1's second bucket — so both get promoted together, keeping
their existing bottom-of-form position, right above the Save button, unchanged.)

`apps/web/src/app/signup/page.tsx` line ~97-100:
```tsx
// before
<p className="mt-6 text-sm text-success">
  Account created! Check your email and click the confirmation link to finish setting
  up your account.
</p>

// after
<p className="mt-6 rounded-lg bg-success-bg px-4 py-3 text-sm text-success-foreground">
  Account created! Check your email and click the confirmation link to finish setting
  up your account.
</p>
```

Two files, four line changes total. No copy changes.

## 7. Homepage / listing-grid / listing-detail gut check

Read all three fresh, as the highest-traffic/most-judged surfaces per the task brief.
Frank assessment, specific and opinionated (not just token swaps):

### 7.1 Homepage (`app/page.tsx`)

The hero is clean and correctly branded post-M7/M12, but a first-time visitor to a
two-sided marketplace's homepage is implicitly asking "is there real inventory here?" —
and the page currently offers zero visual evidence of that (no listings, no categories, no
texture, just centered text on a flat tint). Adding a live listings preview would be a real
new data-fetch (out of scope — no new features this pass), so the fix here has to stay
purely decorative:

- **Add a large, low-opacity decorative icon behind the hero content** — a big `Wrench`
  (ties to the §4/§5 icon decision, zero new data), `aria-hidden`, positioned absolutely,
  `text-primary/10` (10% tint, barely-there), sized ~`h-72 w-72`, clipped by the section's
  `overflow-hidden`. This gives the hero a bit of brand texture without implying any
  content that isn't real.
- **Differentiate the vertical rhythm.** Currently heading → subhead → buttons all sit in
  one uniform `gap-6` stack, which reads as generated/uniform rather than composed. Tighten
  heading→subhead to `gap-3` (they're one reading unit) and add more air before the CTA row
  (`mt-8` instead of falling out of the same `gap-6`) — a clear "read, then act" rhythm.

### 7.2 `/listings` grid

- **Filter panel currently has no background fill** (`border-line p-4`, transparent) sitting
  directly on the same white/`background` page surface as the grid below it — it reads as
  "more form fields," not as a distinct control bar separating chrome from content. Give it
  `bg-surface-muted` (the token that exists for exactly this "recessed panel" purpose
  elsewhere in the app — auth/form page wrappers) so it visually recedes and the grid reads
  as the actual content.
- **`ListingCard` has zero shadow at rest**, only on hover (`hover:shadow-md`) — meaning the
  app's single highest-traffic "product tile" is visually indistinguishable at rest from
  every other flat card/panel in the app (empty states, filter bar, form panels all share
  the identical `border-line` treatment). Add a light resting shadow, `shadow-sm`, kept
  distinct from every other card type in the app (which stay shadow-less) — this is the
  cheapest, most targeted way to make listing cards read as "the product" rather than
  "a panel."
- **Price is under-weighted relative to its importance.** Currently `text-sm text-foreground`
  with no font-weight bump — the same visual weight as the title directly above it. Price
  is the number every visitor scans for first; bump to `text-sm font-semibold` so it's
  unambiguously the dominant number on the card (title stays `font-semibold` too, but at a
  slightly different visual role — this is a small, specific, justified hierarchy nudge,
  not a token swap).

### 7.3 `/listings/[id]` detail

- **The description is the one unlabeled section on the page.** Request-to-rent has an
  `<h2>`, Reviews has an `<h2>` — description is a bare `<p>` dropped into the flow with
  only spacing (`mt-6`) implying "this is the description." Add a `text-lg font-semibold`
  "Description" heading above it, at the same section-heading tier M12 already converged
  the other two headings to (§2.2 of `m12`). No new `border-t` divider — description stays
  visually part of "primary listing info" (title/price/description together), it's the
  owner/reviews sections below that get the stronger `border-t border-line-strong`
  treatment as genuinely separate concerns.
- **The owner block has the identical gap** — avatar + name + city with no label at all,
  sitting right after a `border-t` divider that otherwise reads (correctly) as "a new
  section is starting," but nothing tells you what that section is. Add an "Owner" `<h2>`
  at the same tier, directly reinforcing the brief's own trust framing ("trust between
  strangers matters," already referenced in `m12`'s accent-navy justification) — a labeled
  "who you're dealing with" section is a small, concrete way that framing shows up in the
  actual UI instead of just the color palette.

Net effect of §7's three findings: every below-the-fold section on the detail page
(Description / Owner / Request to rent / Reviews) becomes consistently labeled, and the
grid gets one shadow tweak + one font-weight tweak + one background-fill tweak — small,
specific, cheap changes that meaningfully change how "finished" the two highest-traffic
pages feel, with zero new layout/data work.

## 8. Consolidated file-by-file checklist

For implementer reference — every file touched by this spec, one line each (details in the
section above):

**New files:**
- `components/ui/Spinner.tsx` — §1.1
- `components/ui/Skeleton.tsx` — §1.2
- `components/ui/EmptyState.tsx` — §2.2
- `app/listings/loading.tsx` — §1.2
- `app/listings/[id]/loading.tsx` — §1.2
- `app/listings/mine/loading.tsx` — §1.2
- `app/bookings/mine/loading.tsx` — §1.2
- `app/bookings/owner-requests/loading.tsx` — §1.2

**Modified files:**
- `package.json` (apps/web) — add `lucide-react` — §4
- `components/listings/ImagePlaceholder.tsx` — icon replacement — §5
- `components/listings/ListingCard.tsx` — drop `label` prop, add `shadow-sm`, bump price
  weight, add `focus-visible` ring — §5, §7.2, §3.3
- `components/listings/MyListingCard.tsx` — drop `label` prop, add title-link focus ring —
  §5, §3.3
- `components/bookings/BookingListingRow.tsx` — drop `label` prop, add title-link focus
  ring — §5, §3.3
- `components/listings/ListingForm.tsx` — spinner on submit button, swap `×` → `X` icon on
  photo-remove control — §1.1, §4
- `components/bookings/RequestToRentForm.tsx` — spinner on submit button — §1.1
- `components/reviews/ReviewForm.tsx` — spinner on submit button — §1.1
- `components/bookings/ApproveDeclineButtons.tsx` — spinner on both buttons — §1.1
- `app/profile/ProfileForm.tsx` — spinner on `SaveButton`, promote success/error messages
  to banner treatment — §1.1, §6.2
- `app/login/LoginForm.tsx` — spinner on submit button — §1.1
- `app/signup/page.tsx` — spinner on submit button, promote `confirmationPending` message
  to banner treatment — §1.1, §6.2
- `components/Header.tsx` — focus-visible ring on wordmark + all 5 plain nav links — §3.3
- `app/listings/page.tsx` — filter panel `bg-surface-muted`, both empty-state branches →
  `<EmptyState>` with `SearchX`/`PackageSearch` icons — §2.2, §7.2
- `app/listings/mine/page.tsx` — empty state → `<EmptyState>` with `Wrench` icon — §2.2
- `app/bookings/mine/page.tsx` — empty state → `<EmptyState>` with `CalendarClock` icon —
  §2.2
- `app/bookings/owner-requests/page.tsx` — empty state → `<EmptyState>` with `Inbox` icon —
  §2.2
- `app/listings/[id]/page.tsx` — drop `label` prop on `ImagePlaceholder` call, add
  "Description" and "Owner" `<h2>` headings — §5, §7.3
- `app/page.tsx` (home) — decorative background icon, hero spacing rhythm split — §7.1

**Total: 8 new files, 19 modified files.** Every modified-file change is additive
(spinner/icon/heading/class addition) or a narrow, evidence-cited fix (§6.2's two banner
promotions) — nothing removes or restructures existing markup beyond the `label`-prop
drops in §5, which are a direct, mechanical consequence of the placeholder decision.

## 9. Non-goals (explicit)

- No new features, pages, routes, or schema/RLS changes — every file above already exists
  and every change is markup/className/small-component-extraction, same boundary M7 and
  M12 held.
- No mobile/Expo (`apps/mobile`) changes — `apps/web` only, unchanged boundary since M7.
- **Does not undo any M7 responsive fix or any M12 token.** No spacing, breakpoint, color
  value, or type-scale value introduced here — every new class sources an M12 token
  (`bg-surface-muted`, `border-line`, `text-danger-foreground`, etc.) or Tailwind's default
  scale (the skeleton/spinner sizes), consistent with both prior passes.
- No redesign of `StatusBadge`'s hue set, `StarRating`'s amber convention, or the card
  radius/border language — all three were explicit, considered M12 decisions and stay
  exactly as shipped (§4 explicitly declines to touch status badges or star ratings with
  icons, for the same reason).
- No category→icon mapping for the 14 listing categories, and no custom-built dropdown
  component to support one — explicitly declined in §4, would require new component
  surface area this milestone doesn't authorize.
- No accessibility work beyond the specific `focus-visible` gaps found in §3.3 — this is
  not a full a11y audit (the redundant-tab-stop observation in §3.3 is explicitly flagged
  as out of scope, adjacent to M14).
- No live homepage content/data (a real listings preview strip) — §7.1's homepage fix is
  scoped to decoration/spacing only, per the "no new features/queries" boundary.
- No new component library or UI-kit dependency beyond `lucide-react` — the one
  dependency-level decision this milestone authorizes, per the task brief.

## 10. Copy reference

No user-facing copy changes anywhere in this spec. Every empty-state string, banner
message, button label, and heading text is either preserved verbatim (empty states move
into `<EmptyState>` with identical `title`/`description` text) or is new **non-copy**
structural text that mirrors an existing established label exactly:

- `app/listings/[id]/page.tsx`: two new section headings, `"Description"` and `"Owner"` —
  both chosen to match the existing tier/style of the page's other two section headings
  ("Request to rent this tool", "Reviews"), not a new copy voice.

Every other change in this spec is markup/class/dependency-level only.

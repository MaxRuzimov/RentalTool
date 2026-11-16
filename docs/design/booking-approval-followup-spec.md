# Booking-approval follow-up — renter-side signal + contact-payoff uplift

Status: ready for implementation
Scope: `apps/web` only. Bug-fix addendum to `m5-booking-spec.md` (§3.5, §7, §8) and
`design-system.md` §4.7's badge/token conventions — not a new milestone. No DB migration,
no new table/column, no RLS change, no change to the `booking_contact()` mechanism (already
confirmed correct). Two fixes, both reusing data already queried today:

- **A.** A second badge condition on the header's existing "Bookings" nav link, so a renter
  with an active/upcoming approved booking sees a signal too (today only owners with a
  pending request do).
- **B.** A visual uplift of `ContactInfo.tsx`'s approved-contact payoff into a highlighted
  callout, so landing on the page after approval actually reads as "you're approved, do
  something now" instead of a plain text line with the same weight as the price estimate
  above it.

## 0. Why this is scoped as two fixes, not one

Read `m5-booking-spec.md` §10: the original spec explicitly deferred any notification system
— fine when neither party had a proactive signal. A later post-launch fix (`MILESTONES.md`'s
"Post-launch fixes" row) added a pending-request-count badge to the header for **owners
only** (`Header.tsx` lines ~19–37, ~67–80). That made the owner side feel alive while the
renter side — the side that actually needs to find out "did I get approved?" — still has
zero proactive signal. That asymmetry is the root cause Max's bug report is describing. Fix
A restores symmetry at the one spot the asymmetry was introduced (the header nav link). Fix
B is a smaller, worth-doing-in-the-same-pass issue: even once a renter does revisit
`/bookings/mine`, the approved-contact line has no visual weight to signal "this is the
payoff" — confirmed by reading `BookingListingRow.tsx`, where the price-estimate line and
the contact line render with identical plain-text styling.

## A. Header "Bookings" badge — renter symmetry

### A.1 Query

Add a second count query to `Header.tsx`, alongside the existing owner-pending one, scoped
to the renter side. Reuses the `bookings` table already queried for the owner badge, but —
unlike that query — does **not** need a join to `listings`, since `renter_id` lives directly
on `bookings` (the owner-badge query needs the `listings!inner` join only because
`owner_id` lives on `listings`, not `bookings` — see `m5-booking-spec.md` §2's "No `owner_id`
column on `bookings`" decision).

"Active/upcoming" is computed the same way `/bookings/mine/page.tsx` already computes
`canCancel`'s upcoming check: `status = 'approved'` and `end_date >= today`, where `today` is
`todayISODate()` from `apps/web/src/lib/bookings/pricing.ts` (America/Toronto, never
`new Date().toISOString()` — see that function's own doc comment for why a naive UTC "today"
is wrong for this market).

```ts
import { todayISODate } from "@/lib/bookings/pricing";

// ...inside the existing `if (user)` block, alongside pendingRequestCount:
const { count: approvedUpcomingCount } = await supabase
  .from("bookings")
  .select("id", { count: "exact", head: true })
  .eq("renter_id", user.id)
  .eq("status", "approved")
  .gte("end_date", todayISODate());
```

### A.2 Visual treatment — decision: a distinct green pill, not the same primary pill

**Decision: the new badge uses `bg-success-bg text-success-foreground`** (the same tokens
`StatusBadge.tsx` already uses for the `approved` status pill), **not** `bg-primary
text-primary-foreground` (the owner-pending badge's color).

Justification: the owner's primary-colored pill means "something is waiting on you to act"
— it clears the moment the owner approves/declines (true "action needed" semantics, §A.4).
Reusing that same color for the renter's badge would wrongly imply the renter has something
to act on or respond to, when the actual message is the opposite: good news, nothing to do
but go coordinate pickup. The green success hue is not a new color invented for this —
it's the exact hue a renter already learned means "approved" from the status pill on
`/bookings/mine` itself (`StatusBadge`'s `approved` row, `design-system.md` §4.7). Reusing an
already-meaningful color is both correct (right semantics) and cheap (zero new tokens).

### A.3 `aria-label`

Same pattern as the existing pending badge's `aria-label`:

```
`${approvedUpcomingCount} active upcoming approved booking${approvedUpcomingCount === 1 ? "" : "s"}`
```

e.g. "1 active upcoming approved booking" / "3 active upcoming approved bookings".

### A.4 What renders when a user has both counts simultaneously — decision

This app has exactly one "Bookings" nav link serving both roles (any user can be both an
owner and a renter), so this has to be answered explicitly.

**Decision: render both pills, side by side, never combined into one number and never
prioritized/hidden.** Markup (appended to the existing link, owner pill first, new renter
pill second):

```tsx
<Link
  href="/bookings/mine"
  className="relative rounded-sm text-zinc-600 hover:text-primary hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-zinc-300"
>
  Bookings
  {pendingRequestCount > 0 && (
    <span
      className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground"
      aria-label={`${pendingRequestCount} pending booking request${pendingRequestCount === 1 ? "" : "s"}`}
    >
      {pendingRequestCount > 99 ? "99+" : pendingRequestCount}
    </span>
  )}
  {approvedUpcomingCount > 0 && (
    <span
      className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-success-bg px-1.5 text-xs font-semibold text-success-foreground"
      aria-label={`${approvedUpcomingCount} active upcoming approved booking${approvedUpcomingCount === 1 ? "" : "s"}`}
    >
      {approvedUpcomingCount > 99 ? "99+" : approvedUpcomingCount}
    </span>
  )}
</Link>
```

Justification for not combining: a single summed number (e.g. "3") would conflate two
unrelated facts ("2 people are waiting on you to respond" vs. "you have 1 trip coming up")
into one meaningless integer the user has to re-decode anyway — strictly worse than two
small, differently-colored numbers that are each legible at a glance. Justification for not
prioritizing/hiding one in favor of the other: this entire fix exists because the owner-side
badge was shipped without its renter-side counterpart; silently suppressing the renter pill
whenever an owner pill is also present would re-introduce a narrower version of the exact
bug being fixed (a user who is both an active owner and an active renter — plausible in a
P2P marketplace — would go right back to seeing only the owner signal). Two independent
`&&`-gated spans, each `ml-1`, is also the simplest possible implementation: append one
block, touch nothing about the existing pill's position, class list, or behavior.

Both counts are independent: it is entirely possible to see neither pill (nothing pending,
nothing active/approved), either pill alone, or both at once — no new combined state to
reason about beyond "each pill renders iff its own count is > 0," same as today's single pill.

### A.5 Explicitly not a notification — call-out

This is a standing **"you have an active upcoming approved booking" indicator** (comparable
to an "upcoming trips" count on a travel app), not a dismissible/seen-tracking notification.
It intentionally has none of the owner-pending badge's "clears once you act" semantics —
there is no action a renter takes that should make it disappear early; it clears naturally
and automatically on its own once `end_date` passes `today` (the booking is no longer
"upcoming"), the booking is cancelled, or there simply isn't one. No new column, no read/seen
state, no per-user dismissal — do not build any of that; recomputing the query on every page
load is sufficient and is the entire mechanism. (Compare: the owner-pending badge *also* has
no read/seen column today — it clears because the underlying row's `status` changes away
from `pending`, not because of any seen-tracking. The renter badge is the same kind of
"recompute live from current data" mechanism, just scoped to a different status.)

## B. `ContactInfo.tsx` — visual uplift of the approved-contact payoff

### B.1 Current state (confirmed by reading the file)

`apps/web/src/components/bookings/ContactInfo.tsx` renders two plain `<p>` tags
(`text-sm text-foreground` / `text-xs text-zinc-500 dark:text-zinc-400`) with no background,
border, or distinguishing treatment — identical visual weight to the price-estimate line
directly above it in `BookingListingRow.tsx`. `design-system.md` §4.7's file-by-file pass
confirmed this was left alone during the M12 visual-tokens retrofit specifically because "no
semantic color [was] involved" at the time — this fix is the first time that becomes true.

### B.2 New treatment — decision

**A highlighted callout box using this app's existing `success-bg`/`success-foreground`
token pair** (the same pair `StatusBadge`'s `approved` pill and the `requestSent`
confirmation banner on `/bookings/mine` already use), **`rounded-lg`** (not `rounded-2xl`) —
explicitly matching the existing **banner/callout** convention (`requestSent` banner,
`ProfileForm`'s/`signup`'s save-confirmation banners: all `rounded-lg bg-success-bg ...
text-success-foreground`) rather than the **card** convention
(`BookingListingRow`/`EmptyState`'s `rounded-2xl`). Justification: this is a small nested
notification inside an already-`rounded-2xl` row card, not a new standalone top-level card —
reusing the banner radius keeps it reading as "a confirmation message," which is exactly what
it is, rather than introducing a second nested card shape the design system doesn't have a
precedent for.

Padding is reduced from the full-width banner's `px-4 py-3` to **`px-3 py-2`** — a deliberate,
smaller padding than the page-level banner, since this callout lives inside a row that
already has its own `p-4` padding; using the banner's full padding here would make it
visually heavier than the row containing it. All text inside the box uses
`text-success-foreground` uniformly (including what was previously the muted
`text-zinc-500`/`text-xs` subtext) — once text sits on a tinted background, the app has no
established "muted-on-tinted" token (confirmed: no `/NN` opacity-modifier usage exists
anywhere on these semantic tokens today, see `success-bg`/`success-foreground` in
`globals.css`), so inventing one here would be a new, undocumented pattern rather than a
reuse of an existing one. A plain `text-xs` (vs `text-sm`) for the subtext line is enough
de-emphasis on its own without a second color.

### B.3 Exact copy

A new bold lead line is added ahead of the existing contact line, making the "you're
approved, here's the payoff" message explicit rather than implicit in a plain status pill
elsewhere on the row:

- Lead line (new): **"You're approved!"** — `text-sm font-semibold text-success-foreground`.
  Matches this app's existing exclamatory confirmation tone (`"Request sent! The owner will
  respond soon."` on the same page) rather than inventing a new voice.
- Contact line (unchanged copy, re-colored): **"Contact: {full_name}, {phone}"** —
  `text-sm text-success-foreground`.
- No-phone fallback (unchanged copy, re-colored): **"No phone number on file — contact via
  {full_name}'s profile."** — `text-sm text-success-foreground`.
- Subtext (unchanged copy, re-colored): **"Arrange pickup and payment directly."** —
  `text-xs text-success-foreground`.

The lead line renders in both the phone and no-phone branches — the approval event itself is
true either way; only the next line (contact detail vs. fallback) differs.

### B.4 Full component

```tsx
/**
 * Contact reveal on an `approved` booking row (spec §3.5/§11, visual uplift
 * per booking-approval-followup-spec.md §B) — a plain presentational
 * component, safe to render from a server component since it has no
 * interactivity of its own.
 */
export default function ContactInfo({
  fullName,
  phone,
}: {
  fullName: string | null;
  phone: string | null;
}) {
  const name = fullName || "the other party";

  return (
    <div className="mt-2 rounded-lg bg-success-bg px-3 py-2">
      <p className="text-sm font-semibold text-success-foreground">You&apos;re approved!</p>
      {phone ? (
        <p className="text-sm text-success-foreground">
          Contact: {name}, {phone}
        </p>
      ) : (
        <p className="text-sm text-success-foreground">
          No phone number on file — contact via {name}&apos;s profile.
        </p>
      )}
      <p className="text-xs text-success-foreground">Arrange pickup and payment directly.</p>
    </div>
  );
}
```

No prop-shape change — `BookingListingRow.tsx`'s `contact` slot and both callers
(`/bookings/mine`, `/bookings/owner-requests`) need no changes beyond this file.

### B.5 Mobile — explicit follow-up note, not in scope

`apps/mobile/src/components/ContactInfo.tsx` is a React Native port of the pre-uplift
version of this component (plain `<Text>`, no background/callout treatment), built for a
future milestone. This spec is **web-only** — do not port this visual change to the mobile
component in this pass. Flagged here so a future mobile milestone's design pass knows this
divergence exists and is intentional-for-now, not an oversight.

## Non-goals

- **No DB migration, no new table/column.** Both fixes read data that is already queried
  today (`bookings.status`, `bookings.end_date`, `bookings.renter_id` — fix A; the existing
  `booking_contact()` RPC result — fix B).
- **No read/unread or seen/dismissed tracking of any kind.** Explicitly not built for either
  badge — see §A.5 for why the renter badge doesn't need it, and note the owner badge never
  had it either (it "clears" only because the underlying row's status changes, not via any
  seen-state).
- **No mobile (Expo) app changes.** `apps/mobile`'s header/nav and
  `apps/mobile/src/components/ContactInfo.tsx` are untouched — see §B.5. A mobile-equivalent
  pass is future work, not scoped here.
- **No change to the underlying `booking_contact()` RPC or any RLS policy.** Confirmed
  correct already (contact info *is* returned to the renter once approved) — this is a pure
  UI/signal gap, not a data or access-control bug. Nothing in either fix touches the backend.
- **No new "mark as seen" email/push/SMS notification system.** Still explicitly out of
  scope per `m5-booking-spec.md` §10 — both fixes here are in-app, on-page-load signals only,
  same mechanism class the app already has (recompute from current DB state on every render),
  not a new delivery channel.

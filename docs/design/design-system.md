# M12 — Web Design System (Visual Refresh Retrofit)

Status: ready for implementation
Scope: `apps/web` only. This is a **retrofit onto shipped, reviewed functionality** — no
new pages/routes/features, no schema changes, no mobile/Expo changes. It composes with
M7's responsive/layout fixes (`m7-ui-polish-spec.md`) rather than undoing them: every
fix below is a class-list (mostly color/typography/token) change on markup M7 already
made responsive. Where a file has both an M7 structural fix and an M12 visual fix, the
M7 structure is preserved and only color/type/spacing *values* change.

## 0. Method

Read `apps/web/src/app/globals.css`, every page/component listed in the M12 task brief,
and the "Styling notes" sections of `m2-auth-spec.md` §7, `m3-listings-spec.md` §9,
`m4-search-spec.md` §14, `m5-booking-spec.md` §12, `m6-reviews-spec.md` §12, and all of
`m7-ui-polish-spec.md` (which already did a full inventory of layout/sizing drift — this
spec doesn't re-derive that, it builds the *visual* layer on top of it).

**What's already there, confirmed by reading the code:**
- `globals.css` defines exactly two tokens (`--background`, `--foreground`, near-white/near-black)
  and a `prefers-color-scheme: dark` swap. No brand color exists anywhere in the app —
  every "primary button" is `bg-foreground text-background` (i.e. literally
  black-on-white / white-on-black), every link is `text-foreground hover:underline`.
- `layout.tsx` loads Geist Sans + Geist Mono via `next/font/google` and exposes them as
  `--font-geist-sans`/`--font-geist-mono` CSS vars — but `globals.css` line 25 hardcodes
  `body { font-family: Arial, Helvetica, sans-serif; }`, which **overrides** the loaded
  webfont entirely. The app currently renders in Arial, not Geist. Geist Mono is loaded
  and never referenced anywhere else in the codebase (confirmed by grep) — pure dead weight.
- Card/border/radius treatment (`rounded-2xl border border-black/[.08] dark:border-white/[.145]`,
  `bg-white dark:bg-[#0a0a0a]`) is genuinely consistent app-wide — this is a real,
  deliberate system already, just expressed as hand-repeated literal utility strings
  instead of tokens, and only in monochrome.
- Button height drift (M7 §8, confirmed still present): `h-11` full-page-submits,
  `h-10` standalone CTAs, `h-9` compact inline actions — M7 explicitly left this
  three-tier split as-is (only bumped two `h-9` instances to `h-10` for tap-target
  reasons) and this spec does the same; height is not a visual-design problem, it's
  addressed below only as color/token, not resized further.
- Heading-size drift (not caught by M7, since M7 was layout-only): section-level `<h2>`s
  vary between `text-sm font-semibold` (`RequestToRentForm`, owner-requests page's
  "Pending requests"/"History") and `text-lg font-semibold` (`ReviewsList`'s "Reviews")
  for what is semantically the same heading level. This is the single largest
  typography-consistency issue found and is resolved in §2/§5 below.
- Status badges (`StatusBadge.tsx`, M5 §7) already use a deliberate amber/green/red/zinc
  semantic set with hand-written `dark:` pairs per color. Decision below: keep the same
  four hues (they're conventional and already correct), but source them from the new
  semantic tokens so the `dark:` pairs disappear (the token itself resolves differently
  under `prefers-color-scheme`, so the component needs zero `dark:` classes).
- No `focus-visible` treatment exists anywhere in the app (grepped — zero matches). This
  is a real accessibility gap on a live, public product and is added in §4.

## 1. Color tokens

### 1.1 Decision — palette

**Primary (warm, for actions): a "tool orange."** `orange-700`/`orange-500` family.
Justification: the audience is practical/DIY-minded people and small tradespeople in the
GTA — this should read as *sturdy and job-site*, not "startup SaaS." Orange is already
the closest thing to a house color the app has (the star-rating amber, `StarRating.tsx`),
and a deeper, more saturated orange (rather than that same amber) reads as "tool /
hi-vis / hardware" without being mistaken for the pending-status amber pill or a raw
warning color — it's a different enough shade (orange-700 vs. amber-500/600) that the two
don't collide anywhere they'd appear near each other (a solid pill vs. a solid button,
never adjacent in the same component).

**Accent (cool, for trust/identity): a deep "harbor" navy.** Used for the wordmark, text
links, and anywhere a calmer, more institutional color communicates trust between two
strangers transacting — the brief's own framing ("trust between strangers matters"). Not
a bright SaaS blue — desaturated and dark, closer to navy/slate than to Bootstrap/Stripe
blue, so it reads as reliable rather than techy.

**Neutrals stay on Tailwind's built-in `zinc` scale** (already used everywhere in the
app — `zinc-50` through `zinc-900`). No new gray scale is introduced; this avoids
touching the one thing that was already consistent.

**Semantic (success/warning/danger) stay conceptually the same hues M5 §7 already chose**
(green/amber/red) — not redesigned, just re-sourced from tokens (§1.3) so dark mode is
automatic instead of hand-paired.

### 1.2 Concrete values

| Token | Light | Dark | Notes |
|---|---|---|---|
| `--background` | `#ffffff` | `#0a0a0a` | unchanged from today |
| `--foreground` | `#18181b` (zinc-900) | `#f4f4f5` (zinc-100) | was `#171717`/`#ededed`; realigned to exact zinc values so it's literally the same scale used everywhere else |
| `--surface` | `#ffffff` | `#161616` | card/panel background. Dark value is intentionally *lighter* than `--background` (`#0a0a0a`) — today cards and page background are the identical dark hex, so dark-mode cards have zero elevation beyond their border. This gives real elevation. |
| `--surface-muted` | `#fafafa` (zinc-50) | `#09090b` (zinc-950) | the "centered card on a tinted page" background (auth/listing-form pages), replaces literal `bg-zinc-50 dark:bg-black` |
| `--line` | `rgb(0 0 0 / 8%)` | `rgb(255 255 255 / 14.5%)` | identical alpha values to today's `border-black/[.08]` / `dark:border-white/[.145]` — a direct token wrap, zero visual change, but now one class instead of a `dark:`-paired two |
| `--line-strong` | `rgb(0 0 0 / 15%)` | `rgb(255 255 255 / 22%)` | new — for stronger dividers (e.g. `border-t` section rules on the listing detail page, currently the same weak `--line`) |
| `--primary` | `#c2410c` (orange-700) | `#f97316` (orange-500) | primary button fill |
| `--primary-hover` | `#9a3412` (orange-800) | `#fb923c` (orange-400) | |
| `--primary-active` | `#7c2d12` (orange-900) | `#ea580c` (orange-600) | pressed state |
| `--primary-foreground` | `#ffffff` | `#171717` | text/icon on a primary-filled surface. Light-mode orange-700 gives white text a 5.2:1 contrast ratio (AA); dark-mode orange-500 gives near-black text a 6.4:1 ratio — both computed, both pass AA. (orange-600 was checked and rejected for the light-mode fill: white-on-orange-600 is only ~3.6:1, fails AA text contrast.) |
| `--accent` | `#1e3a5f` (harbor navy) | `#93b4d6` (light steel blue) | wordmark, text links, secondary emphasis |
| `--accent-hover` | `#16293f` | `#b7cfe6` | |
| `--accent-foreground` | `#ffffff` | `#0a0a0a` | text on an accent-filled surface (rare — accent is mostly used as text/border color, not a fill) |
| `--success` | `#16a34a` | `#4ade80` | |
| `--success-bg` | `#dcfce7` | `rgb(22 163 74 / 20%)` | |
| `--success-foreground` | `#14532d` | `#bbf7d0` | |
| `--warning` | `#d97706` | `#fbbf24` | |
| `--warning-bg` | `#fef3c7` | `rgb(217 119 6 / 20%)` | |
| `--warning-foreground` | `#78350f` | `#fde68a` | |
| `--danger` | `#dc2626` | `#f87171` | |
| `--danger-bg` | `#fee2e2` | `rgb(220 38 38 / 20%)` | |
| `--danger-foreground` | `#7f1d1d` | `#fecaca` | |

### 1.3 `globals.css` — full replacement

```css
@import "tailwindcss";

:root {
  --background: #ffffff;
  --foreground: #18181b;
  --surface: #ffffff;
  --surface-muted: #fafafa;
  --line: rgb(0 0 0 / 8%);
  --line-strong: rgb(0 0 0 / 15%);

  --primary: #c2410c;
  --primary-hover: #9a3412;
  --primary-active: #7c2d12;
  --primary-foreground: #ffffff;

  --accent: #1e3a5f;
  --accent-hover: #16293f;
  --accent-foreground: #ffffff;

  --success: #16a34a;
  --success-bg: #dcfce7;
  --success-foreground: #14532d;
  --warning: #d97706;
  --warning-bg: #fef3c7;
  --warning-foreground: #78350f;
  --danger: #dc2626;
  --danger-bg: #fee2e2;
  --danger-foreground: #7f1d1d;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-surface: var(--surface);
  --color-surface-muted: var(--surface-muted);
  --color-line: var(--line);
  --color-line-strong: var(--line-strong);

  --color-primary: var(--primary);
  --color-primary-hover: var(--primary-hover);
  --color-primary-active: var(--primary-active);
  --color-primary-foreground: var(--primary-foreground);

  --color-accent: var(--accent);
  --color-accent-hover: var(--accent-hover);
  --color-accent-foreground: var(--accent-foreground);

  --color-success: var(--success);
  --color-success-bg: var(--success-bg);
  --color-success-foreground: var(--success-foreground);
  --color-warning: var(--warning);
  --color-warning-bg: var(--warning-bg);
  --color-warning-foreground: var(--warning-foreground);
  --color-danger: var(--danger);
  --color-danger-bg: var(--danger-bg);
  --color-danger-foreground: var(--danger-foreground);

  --font-sans: var(--font-inter);
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #f4f4f5;
    --surface: #161616;
    --surface-muted: #09090b;
    --line: rgb(255 255 255 / 14.5%);
    --line-strong: rgb(255 255 255 / 22%);

    --primary: #f97316;
    --primary-hover: #fb923c;
    --primary-active: #ea580c;
    --primary-foreground: #171717;

    --accent: #93b4d6;
    --accent-hover: #b7cfe6;
    --accent-foreground: #0a0a0a;

    --success: #4ade80;
    --success-bg: rgb(22 163 74 / 20%);
    --success-foreground: #bbf7d0;
    --warning: #fbbf24;
    --warning-bg: rgb(217 119 6 / 20%);
    --warning-foreground: #fde68a;
    --danger: #f87171;
    --danger-bg: rgb(220 38 38 / 20%);
    --danger-foreground: #fecaca;
  }
}

body {
  background: var(--background);
  color: var(--foreground);
}
```

Note the removed `font-family: Arial, Helvetica, sans-serif;` line — that was silently
overriding the loaded webfont (see §2). `@theme inline` registration is what turns every
`--color-*` var into a usable Tailwind utility (`bg-primary`, `text-accent`,
`border-line`, `ring-primary`, `bg-warning-bg text-warning-foreground`, etc.) in both
light and dark mode **with no `dark:` variant needed on the class itself** — the
underlying var flips at `:root` under the media query, so one utility class now covers
both modes for every brand/semantic color. `dark:` variants are still needed (unchanged)
for anything sourced from Tailwind's built-in `zinc-*`/`red-*`/etc. palettes directly,
since those are fixed values, not vars — see §4 for exactly where that still applies.

### 1.4 Status badges — harmonized, not redesigned

Same four hues M5 §7 chose (amber/green/red/zinc), same meaning, now sourced from the
tokens above instead of hand-paired Tailwind color classes — this both harmonizes them
into the one palette and deletes every `dark:` class in the component (see §4.6).

## 2. Typography

### 2.1 Decision — webfont

**Switch to Inter, loaded via `next/font/google`, self-hosted at build time.** This is
not in tension with "fast and cheap MVP": `next/font` downloads and subsets the font at
build time and serves it from the app's own origin with zero extra runtime requests,
zero third-party network dependency, and no added latency risk — functionally free
compared to the system-stack alternative. Inter is chosen over keeping Geist (already
loaded, already free) because Geist is currently *not actually rendering* (see §0 — the
hardcoded `font-family: Arial` masks it), and Inter is a more neutral, maximally-legible
UI workhorse that reads as "real product" without any stylistic personality that could
clash with the new orange/navy palette — appropriate for a practical, no-frills
marketplace. Geist Mono is dropped entirely (confirmed unused anywhere but its own
declaration).

`layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Header from "@/components/Header";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RentalTool",
  description: "Rent tools from people near you in the GTA.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <Header />
        {children}
      </body>
    </html>
  );
}
```

(`font-sans` on `<body>` is new — with the dead `font-family: Arial` line removed from
`globals.css`, something needs to apply `var(--font-sans)`; Tailwind's `font-sans`
utility now resolves to it via the `@theme inline` mapping in §1.3.)

### 2.2 Type scale

| Tier | Classes | Used for | Today's actual usage (drift being resolved) |
|---|---|---|---|
| Hero | `text-3xl sm:text-4xl font-bold tracking-tight` | Home page hero only | today `font-semibold` — bumped to `font-bold` so the one hero moment on the site reads with real weight, distinct from every page title below it |
| Page title (h1) | `text-2xl sm:text-3xl font-semibold tracking-tight text-foreground` | Every app-page `<h1>` (`/listings`, `/listings/mine`, `/bookings/mine`, `/bookings/owner-requests`, listing detail, auth/profile/listing-form card titles) | today static `text-2xl` everywhere, no responsive step — adds an `sm:text-3xl` bump for presence at wider widths, otherwise unchanged |
| Section heading (h2) | `text-lg font-semibold text-foreground` | "Reviews", "Pending requests"/"History", "Request to rent this tool" | **today ranges `text-sm`→`text-lg` for the same semantic level — this is the biggest single typography-consistency fix in this pass; all three call sites converge on `text-lg`.** |
| Card/subsection title (h3) | `text-sm font-semibold text-foreground` | `ListingCard`/`MyListingCard` titles, `ReviewForm`'s "Rate this rental", "Your review" label | unchanged — already consistent |
| Body | `text-sm font-normal leading-relaxed text-foreground` | Descriptions, paragraph copy, form values | unchanged — already the app's dominant body size |
| Meta/small | `text-xs text-zinc-500 dark:text-zinc-400` | Location, category, dates, char counters, helper text | unchanged |
| Button label | `text-sm font-medium` | Every button/CTA | unchanged — already consistent app-wide, no drift found here |
| Form label | `text-sm font-medium text-foreground` | Every `<label>` | unchanged |

## 3. Spacing scale

Base unit stays Tailwind's default 4px scale (no new scale invented). Formalized
semantic aliases, all values already present somewhere in the app today:

| Alias | Value | Use |
|---|---|---|
| `gap-1` (4px) | field label → input gap | unchanged, already universal |
| `gap-2`/`gap-3` (8/12px) | inline control clusters (badge+action, filter sub-row) | unchanged |
| `gap-4` (16px) | stacked form-field rhythm (`flex flex-col gap-4` on every form), card internal gap | unchanged |
| `p-4` | list-row/card padding (`ListingCard`, `MyListingCard`, `BookingListingRow`, review-list item, `RequestToRentForm` panel, filter-bar panel) | unchanged — this tier is already fully consistent, confirmed by inventory |
| `p-8` | card-form container padding (auth pages, `ListingForm`, `ProfileForm`) | unchanged — also already consistent |
| `mt-6`/`pt-6` | related-but-distinct in-page section break (e.g. listing detail's owner block, reviews block, both `border-t pt-6`) | unchanged |
| `mt-8`/`mt-10` | major page-section break (empty states, page h1 → content) | unchanged |
| `py-12` | content-list page vertical padding (`/listings`, `/bookings/*`, `/listings/mine`) | unchanged |
| `py-16` | centered-card page vertical padding (auth, `ListingForm`, `ProfileForm`) | unchanged — this is a deliberate second archetype (full list page vs. centered card page), not drift; both are kept as documented, separate conventions |

No spacing values change in this pass — the inventory found the spacing rhythm is
already genuinely consistent within each of the two page archetypes; the actual
inconsistency budget in this app was in **color and type**, not space. This section
exists so future pages have a documented reference rather than "whatever the last page
did."

## 4. Component treatments

Every treatment below is the **one canonical version** to apply everywhere that
component type appears — no per-page variation.

### 4.1 Primary button (filled)

```
inline-flex items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover active:bg-primary-active disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background
```
Height stays contextual per M7 §8's three-tier split (`h-11` full-page submit / `h-10`
standalone CTA / `h-10` compact inline — see §4.7 for the one `h-9`→`h-10` bump M7 left
outstanding, now folded in here since it's touched anyway). Replaces every
`bg-foreground ... text-background ... hover:bg-[#383838] dark:hover:bg-[#ccc]` instance
app-wide — that hover-hex hack disappears entirely, replaced by `hover:bg-primary-hover`
(one class, works in both modes automatically).

### 4.2 Secondary / text-link button

```
text-sm font-medium text-accent underline-offset-2 hover:underline hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm
```
Replaces every plain `text-foreground hover:underline` link/text-button (nav links,
"Edit listing", "Clear filters", "Log in to request this tool" when rendered as a link,
"Leave a review", etc.) — these become the app's one *colored* interactive-text
treatment, giving genuine visual distinction between "this is clickable" and "this is
just text," which the current all-monochrome-`text-foreground` treatment doesn't provide.

### 4.3 Secondary button (outlined)

```
inline-flex items-center justify-center rounded-full border border-line px-6 text-sm font-medium text-foreground transition-colors hover:border-transparent hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background
```
Used where today's `border-black/[.08] ... hover:bg-black/[.04] dark:hover:bg-[#1a1a1a]`
pattern appears (home page's "Browse listings" secondary CTA, header's "Log out").
Replaces the two hand-picked hover hex values with `hover:bg-surface-muted`.

### 4.4 Destructive button / link

```
text-sm font-medium text-danger hover:underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm
```
Replaces every `text-red-600` instance (`MyListingCard` Delete, `ListingForm`'s
`DeleteListingLink`, `CancelBookingButton`, `ApproveDeclineButtons`' Decline text color).
`ApproveDeclineButtons`' Decline is a *filled outline* button, not plain text — keep its
outline shape, just re-source the color: `border-danger/30 text-danger hover:bg-danger-bg`
(was `border-red-600/30 ... hover:bg-red-600/5` — direct token swap).

### 4.5 Form inputs (text / number / email / password / tel / url / date / select / textarea)

```
w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20
```
Same shape as today (`rounded-lg border ... px-3 py-2 text-sm`), now on the `border-line`
token (kills every `dark:border-white/[.145]` pairing) plus a real focus state (today
inputs have **no** focus style at all beyond the browser default outline, which is
inconsistent across browsers and easy to lose against the app's borders). The
price-amount input's wrapping box (`ListingForm`'s `$`-prefixed container) gets the same
border/focus treatment on the wrapper instead of the inner input.

### 4.6 Cards / rows (listing cards, booking rows, review rows, panels)

```
rounded-2xl border border-line bg-surface
```
(padding per §3: `p-4` for rows/cards, `p-8` for card-form containers). Replaces
`border-black/[.08] bg-white dark:border-white/[.145] dark:bg-[#0a0a0a]` everywhere —
one class pair instead of four, and dark-mode cards now actually sit above the page
background (`--surface` `#161616` vs. `--background` `#0a0a0a`) instead of being
indistinguishable flat regions.

`ListingCard`'s hover (`hover:shadow-md`) stays as-is — shadow, not color, no change needed.

### 4.7 Status badges

```tsx
const STATUS_STYLES: Record<string, { label: string; classes: string }> = {
  pending: { label: "Pending", classes: "bg-warning-bg text-warning-foreground" },
  approved: { label: "Approved", classes: "bg-success-bg text-success-foreground" },
  declined: { label: "Declined", classes: "bg-danger-bg text-danger-foreground" },
  cancelled: { label: "Cancelled", classes: "bg-surface-muted text-zinc-600 dark:text-zinc-400" },
};
```
Same `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium` shell,
unchanged. Every `dark:` pair in the old table disappears except `cancelled`'s (zinc has
no semantic token, correctly stays on the built-in scale with an explicit `dark:` pair).

### 4.8 Empty-state container

```
flex flex-col items-center gap-4 rounded-2xl border border-line py-16 text-center
```
Same shape as today, `border-line` token swap only. (M7 §7 already fixed the one
`gap-2`→`gap-4` outlier on `/bookings/owner-requests` — nothing further needed there.)

### 4.9 Focus-visible (new — no prior treatment existed)

Standard ring, used identically on every interactive element (buttons, links styled as
buttons, inputs, selects, the star-rating buttons):

```
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background
```

Destructive actions use `focus-visible:ring-danger` instead of `-ring-primary` (§4.4).
This is additive only — it changes nothing about mouse/default appearance, only what
renders on keyboard focus, and directly addresses a real live-product accessibility gap
(zero focus-visible coverage found anywhere in the current codebase).

### 4.10 Header / nav

- Wordmark: `text-base font-semibold text-accent` (was `text-foreground`) — the one
  place the accent navy appears as a solid brand mark.
- Nav links (Browse listings / My listings / Bookings / account name): `text-sm
  font-medium text-zinc-600 dark:text-zinc-300 hover:text-primary hover:underline
  underline-offset-2` (was flat `text-foreground hover:underline`) — resting state
  steps back to a secondary neutral so the page's real content reads as more prominent
  than chrome, hover state now uses the primary orange as real color feedback instead of
  only an underline.
- "Log out" (secondary/outlined button): §4.3 treatment, `h-9` unchanged (M7 §8's
  explicit "leave header chrome at h-9" call stands — this pass doesn't revisit height).
- "Sign up" (primary button, in the logged-out state): §4.1 treatment, `h-9` unchanged
  for the same reason.
- Border: `border-b border-line` (was `border-black/[.08] dark:border-white/[.145]`).
- Structure (`flex-wrap`, `px-4 sm:px-6`, `max-w-[10rem] truncate` on the name) is M7's
  fix — untouched.

## 5. Page-by-page application checklist

Concrete, file-by-file. Every color/type utility below is a direct swap per §1/§2/§4 —
implementer should not need to make any additional judgment calls.

**`app/layout.tsx`** — swap Geist→Inter per §2.1; add `font-sans` to `<body>`.

**`app/globals.css`** — full replacement per §1.3.

**`components/Header.tsx`** — §4.10 in full (wordmark color, nav link colors, border,
button treatments). Structural classes (flex-wrap, padding, name truncation) untouched.

**`app/page.tsx` (home)**
- Wrapper: `bg-surface-muted` (was `bg-zinc-50 dark:bg-black`).
- `<h1>`: Hero tier per §2.2 (`font-bold` instead of `font-semibold`).
- Subhead `<p>`: unchanged classes, still `text-zinc-600 dark:text-zinc-400`.
- "Get started" link: §4.1 primary button.
- "Browse listings" link: §4.3 secondary button.

**`app/login/LoginForm.tsx`**
- Wrapper: `bg-surface-muted`; card: `bg-surface border-line` (§4.6, `p-8`).
- `<h1>`: page-title tier (§2.2).
- Inputs: §4.5.
- Error text: `text-danger` (was `text-red-600`).
- Submit button: §4.1 (`h-11`, unchanged height).
- "Sign up" link at bottom: §4.2.

**`app/signup/page.tsx`** — identical set of changes to LoginForm above (same shell,
same field set): wrapper/card tokens, `<h1>` tier, inputs, error/success text
(`text-danger` / `text-success`, was `text-red-600` / `text-green-600`), submit button
§4.1, bottom "Log in" link §4.2.

**`app/profile/page.tsx`** — server wrapper only, no visual classes; no change.

**`app/profile/ProfileForm.tsx`**
- Same wrapper/card/heading pattern as signup.
- Inputs (`full_name`, `avatar_url`, `phone`, `city`): §4.5.
- Avatar preview `<img>` border: `border-line`.
- Success/error state text: `text-success` / `text-danger`.
- `SaveButton`: §4.1.

**`app/listings/page.tsx` (browse + filters)**
- `<h1>`: page-title tier.
- Filter form panel: `border-line` (§4.6 shell without the `bg-surface`, since today it's
  intentionally borderless/transparent — keep that, just re-source the border).
- All filter inputs/selects: §4.5 (`inputClassName` constant updated once, used
  everywhere in the file already — single edit point).
- "Apply filters" button: §4.1.
- "Clear filters" link: §4.2.
- Empty-state containers (both branches): §4.8, "Be the first to list a tool!" /
  "Clear filters" links inside them: §4.2.
- Card grid: unchanged (structural, not visual-token-driven).

**`components/listings/ListingCard.tsx`**
- Card shell: §4.6 (`border-line bg-surface`).
- Title (`<h3>`): unchanged tier (§2.2 card-title, already correct), color unchanged
  (`text-foreground`).
- Price `<p>`: unchanged.
- Location/category meta: unchanged (`text-zinc-*`, already correct tier/color).

**`components/listings/MyListingCard.tsx`**
- Card shell: §4.6.
- "Edit" link: §4.2. "Delete" button: §4.4.
- Everything else (title, price, meta, M7's responsive row-stack): unchanged.

**`app/listings/mine/page.tsx`**
- `<h1>`: page-title tier.
- `NEW_LISTING_BUTTON` constant: §4.1 (drop the local hardcoded string, use the shared
  primary-button treatment).
- Empty state: §4.8, same button swap inside it.

**`app/listings/new/page.tsx`** — thin server wrapper around `ListingForm`; no direct
visual classes to change.

**`app/listings/[id]/edit/page.tsx`**
- "Listing not found" fallback state: heading tier unchanged (`text-lg`→ acceptable as a
  one-off, not a page title), "Back to listings" link: §4.2.
- Otherwise thin wrapper around `ListingForm`.

**`components/listings/ListingForm.tsx`**
- Wrapper/card: `bg-surface-muted` / `bg-surface border-line` (§4.6, `p-8`).
- `<h1>`: page-title tier.
- All inputs/selects/textarea (title, description, category, price amount + wrapper
  box, price unit, location): §4.5.
- Photo dropzone border: `border-line-strong` dashed (was `border-black/[.15]
  dark:border-white/[.2]`), hover `hover:border-primary`.
- Photo-note / error text: `text-danger`.
- Photo remove "×" button: unchanged (small utility chrome, not a semantic-color case).
- Submit button: §4.1. `DeleteListingLink`: §4.4, divider `border-line`.

**`app/listings/[id]/page.tsx` (detail)**
- Photo-upload error banner: `text-danger`.
- Hero/thumbnail images: unchanged (no color classes).
- `<h1>` (listing title): page-title tier.
- "Edit listing" link: §4.2.
- Price `<p>`: unchanged (`text-foreground`, already correct weight).
- Category/location meta: unchanged.
- Rating line: unchanged (`StarRating` + `text-foreground`); "No reviews yet": unchanged
  meta tier.
- Description: unchanged.
- Section dividers (owner block, reviews block): `border-t border-line-strong` (bumped
  from `border-line`/today's flat `border-black/[.08]` — these are real section breaks,
  not card edges, so they get the slightly stronger divider per §1.2's new
  `--line-strong` token).
- Owner name: unchanged. Owner city meta: unchanged.
- "This is your listing." note + "View requests" link: note text unchanged, link §4.2.
- `RequestToRentForm` and `ReviewsList`: see their own component entries below.

**`components/bookings/RequestToRentForm.tsx`**
- Panel: `border-line` (drop the `bg-surface` — kept borderless/transparent like today,
  intentional, matches the filter-bar panel treatment).
- `<h2>` "Request to rent this tool": **bump to section-heading tier** (`text-lg
  font-semibold`, was `text-sm font-semibold`) — this is one of the three §2.2 heading
  convergence points.
- Date inputs: §4.5.
- Validation/error text: `text-danger`.
- Estimate text: unchanged (`text-foreground`/meta tier already correct).
- `PRIMARY_BUTTON` constant (used for both the real submit and the logged-out "Log in to
  request this tool" link): §4.1.

**`app/bookings/mine/page.tsx`**
- `<h1>`: page-title tier.
- Tab line ("My requests" / "Requests to me"): active tab `text-foreground`
  (unchanged), inactive tab link `text-accent` per §4.2's link color (was
  `text-foreground underline`), separator dot unchanged (`text-zinc-400`).
- `requestSent` success banner: `bg-success-bg text-success-foreground` (was
  `bg-green-50 text-green-600 dark:bg-green-900/20` — direct token swap, same shape).
- Empty state: §4.8; "Browse listings" button inside it: §4.1 (reuse the same
  `BROWSE_BUTTON` constant → §4.1).

**`app/bookings/owner-requests/page.tsx`**
- `<h1>`: page-title tier.
- Tab line: same treatment as `/bookings/mine`, mirrored (this page's active tab is
  "Requests to me").
- Empty state (page-level, `bookings.length === 0`): §4.8.
- `<h2>`s "Pending requests" / "History": **bump to section-heading tier** (`text-lg
  font-semibold`, was `text-sm font-semibold`) — second of the three §2.2 convergence
  points.
- Sub-list empty notes ("No pending requests." / "No past requests yet."): unchanged
  (meta tier, intentionally lighter than the full empty-state container per M7 §7 —
  not touched by this pass either).

**`components/bookings/BookingListingRow.tsx`**
- Card shell: §4.6.
- Title link: unchanged color/tier, hover unchanged (`hover:underline` stays plain,
  this is a card title not a nav link — doesn't need the accent-color link treatment).
- Date-range / estimate text: unchanged.
- `topLabel` (renter name on owner view): unchanged meta tier.

**`components/bookings/StatusBadge.tsx`** — full replacement per §4.7.

**`components/bookings/ApproveDeclineButtons.tsx`**
- Approve: §4.1 primary button, `h-10` (M7 §8's bump already applied, unchanged here).
- Decline: §4.4's outline-destructive variant (`border-danger/30 text-danger
  hover:bg-danger-bg`, was `border-red-600/30 text-red-600 hover:bg-red-600/5`).
- Inline error text: `text-danger`.

**`components/bookings/CancelBookingButton.tsx`** — button: §4.4. Error text: `text-danger`.

**`components/bookings/ContactInfo.tsx`** — both `<p>`s unchanged (`text-foreground` /
meta tier already correct, no semantic color involved).

**`components/reviews/StarRating.tsx`**
- Filled-star color: unchanged — `text-amber-500` stays exactly as-is. This is a
  deliberate exception: star ratings are a universally-understood amber/gold convention
  independent of brand color, and remapping it to `--primary` (orange) would make
  ratings look like they're using the *action* color, which is a worse signal, not a
  better one. Empty-star `text-zinc-300 dark:text-zinc-600`: unchanged.
- Interactive button tap-target padding (M7 §6's `p-1.5 -m-1.5`): unchanged, structural.
- New: add the §4.9 focus-visible ring to the interactive `<button>` (the one place in
  this component that was missing any focus treatment).

**`components/reviews/ReviewForm.tsx`**
- Card shell: §4.6.
- `<h3>` "Rate this rental": unchanged tier (already correct, `text-sm font-semibold`).
- Textarea: §4.5.
- Char counter: unchanged meta tier.
- Error text: `text-danger`.
- `PRIMARY_BUTTON` constant: §4.1, `h-10` (M7 §8's bump, unchanged).
- "Cancel" text button: §4.2.

**`components/reviews/ReviewsList.tsx`**
- `<h2>` "Reviews": unchanged — this is the one call site that was already at the
  correct `text-lg font-semibold` tier (the other two converge to match it, per §2.2).
- Empty note: unchanged meta tier.
- Individual review cards: §4.6 shell.
- Reviewer name / date / separator dot: unchanged.
- Comment text: unchanged.

**`components/reviews/ReviewRowSlot.tsx`**
- "Your review" label: unchanged meta tier.
- "Leave a review" text button: §4.2.
- Delegates to `ReviewForm` for the expanded state (already covered above).

**`components/listings/ImagePlaceholder.tsx`** — unchanged. `bg-zinc-100
dark:bg-zinc-900 text-zinc-400 dark:text-zinc-600` is a neutral placeholder, not a
brand/semantic surface — deliberately stays off the new tokens so it continues to read
as "no photo" rather than picking up any card elevation/brand tint.

**`components/listings/OwnerAvatar.tsx`** — unchanged (image + border; apply
`border-line` if it currently hardcodes the old border classes, otherwise no change).

## 6. Non-goals (explicit)

- No new features, pages, or routes.
- No schema/RLS/server-action changes — every edit in §5 is a className/JSX-attribute
  change, nothing touches a query, mutation, or migration.
- No mobile/Expo (`apps/mobile` or equivalent) changes — this spec is `apps/web` only,
  same boundary M7 held.
- **Does not undo any M7 responsive/layout fix.** Every structural class M7 introduced
  (`flex-wrap`, `sm:contents`, `sm:flex-row`, `max-w-[10rem] truncate`, the two-field
  mobile-stack pattern, the tap-target padding on `StarRating`) is left exactly as M7
  shipped it; this pass only changes color, font, and the two `text-sm`→`text-lg`
  heading fixes in §2.2/§5, which are typography-tier fixes, not layout changes.
- No button-height unification beyond what M7 §8 already decided (`h-9`/`h-10`/`h-11`
  three-tier split stands; this spec doesn't revisit it further).
- No new component library or UI-kit dependency. The only dependency-level change is
  swapping which Google Font `next/font/google` loads (Geist → Inter) — still zero
  runtime network dependency, self-hosted at build time exactly as today.
- No redesign of the status-badge hue set, the star-rating amber, or the card
  radius/border language — all three are kept as previously decided, only re-sourced
  from tokens where that removes `dark:` duplication (§4.6, §4.7).
- No accessibility work beyond the two items explicitly in scope here (§4.9
  focus-visible, and the AA contrast check baked into §1.2's primary color choice) —
  this is not a full a11y audit.

## 7. Copy reference

No user-facing copy changes. The only non-visual string touched is `layout.tsx`'s
`metadata.description`, which is already correct today (`"Rent tools from people near
you in the GTA."`, set by M7) and is not altered by this pass.

# M8 — Mobile App UX/UI Spec (Expo, Core Screens)

Status: ready for implementation
Scope: new `apps/mobile` workspace — React Native via **Expo** (TypeScript), talking to the exact same Supabase project/tables/RLS policies as `apps/web` (no backend changes in this spec). Mirrors the renter-side journey (browse → request → review) plus basic owner booking actions (approve/decline) from the web app onto a second platform. Does **not** redesign the product — see §4 for what's carried over 1:1 and what's deferred.
Non-goals for M8: listing creation/editing (photo upload) — deferred, see §4.1; payment/checkout; in-app messaging/chat; push notifications; offline support; tablet-specific layout; App Store/Play Store submission (M10). Full list with justification in §10.

## 0. Assumptions engineers should verify before starting

- M2–M7 are merged and `apps/web` behaves exactly as documented in `docs/design/m2-auth-spec.md` through `docs/design/m7-*` (M7 was web-responsive polish only, no product/schema change). This spec builds on the same Supabase schema — `profiles`, `listings`, `listing_images`, `bookings`, `reviews` and their RLS policies, exactly as they exist today in `supabase/migrations/00000000000001..00000000000005_*.sql`. **No new migration is expected for M8**; if implementation surfaces a genuine gap (e.g. a query shape the mobile UI needs that RLS doesn't currently allow), flag it rather than quietly work around it in the app.
- `apps/mobile` is a new workspace under the existing root `"workspaces": ["apps/*"]` glob in `/Users/maxruzimov/RentalTool/package.json` — no root config change needed to pick it up. Add a root `dev:mobile` script (`"expo start"` via `--workspace=mobile`) alongside the existing `dev`/`build`/`lint` scripts, mirroring the `web` workspace's script-naming convention.
- The mobile app is a **separate Expo project with its own `package.json`**, not sharing `apps/web`'s React 19/Next 16 dependency tree (Expo pins its own compatible React Native/React versions per SDK release — mixing them in one workspace is not viable). There is currently no shared `packages/*` workspace for logic reuse between `apps/web` and `apps/mobile` — see §6 for how pure-logic modules (pricing math, category list, status-badge colors) are ported rather than imported.
- Same "test against local dev Supabase, don't touch remote from automated agents" convention as every prior milestone — the mobile app's `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` point at the same project web already uses (local dev instance for local dev, same values already in `apps/web/.env.local`), never a second/parallel Supabase project (§9).
- This spec is UI/UX and scope-only; wiring `expo-router`, the Supabase RN client, and the actual screen components is the mobile-engineer's implementation, built to satisfy what's documented here — same division of labor as every prior spec ("spec only; code is the engineer's implementation").

## 1. Tech choices

### 1.1 Navigation library — **Expo Router**, not React Navigation (imperative)

**Decision: Expo Router** (file-based routing, built on top of React Navigation under the hood — so this is not "instead of React Navigation," it's "React Navigation via a file-based API instead of hand-assembled navigators").

Justification:
- The engineering team already thinks in the Next.js App Router mental model for `apps/web` — routes are files/folders, protected routes are a check at the top of a route file, params are read via a typed hook, `redirect()`/`router.push()` reads as "go to this path." Expo Router deliberately mirrors that exact model (`app/` directory, `[id].tsx` dynamic segments, `(group)` layout groups, `_layout.tsx` for shared chrome) — an engineer who just built M2–M7 can carry over most of that intuition directly, which is the single biggest velocity win available for a "fast and cheap MVP" second platform.
- It ships as part of the standard `npx create-expo-app` template as of recent Expo SDKs, so it is not an unusual/extra dependency choice — it is the default, most-supported way to structure a new Expo app today.
- Deep-linking and typed routes come free, which costs nothing here but is a reasonable hedge if this app ever needs a shared link (e.g. a listing URL) later.
- The alternative (hand-assembling `NavigationContainer` + `createBottomTabNavigator` + nested `createNativeStackNavigator`s, "React Navigation" in the imperative-component sense) is more code to write and reason about for the exact same resulting navigation tree described in §2, with no corresponding benefit for this app's scope.

### 1.2 Supabase client for React Native

- Same `@supabase/supabase-js` package as web (not `@supabase/ssr` — that package exists specifically for framework server-rendering/cookie-forwarding, which has no equivalent concept in a client-only Expo app; irrelevant here).
- **Session persistence: `@react-native-async-storage/async-storage`**, wired as `supabase.auth`'s custom `storage` option — this is the storage adapter Supabase's own React Native/Expo quickstart documents, and it is what lets a session survive an app restart (Supabase's client already handles token refresh/rotation once given a storage adapter; nothing custom needs to be written for that).
  - Considered `expo-secure-store` instead (iOS Keychain / Android Keystore-backed, marginally more "secure" for at-rest storage): not chosen for M8 because SecureStore's per-value size ceiling (historically ~2KB) is uncomfortably close to a full Supabase session object's size once you include the JWT + refresh token + user metadata, requiring a chunking wrapper to use safely — real extra complexity for a security property (protecting a session token from other apps on the same device tampering with plain storage) that is not a stated concern anywhere in `PROJECT_BRIEF.md` and is consistent with this app already storing the equivalent session as a plain (if httpOnly) cookie on web. AsyncStorage is what the framework's own docs recommend as the default, and is sufficient for this MVP's actual risk profile — flagged here as a reasonable future hardening step (SecureStore, or an AsyncStorage+SecureStore hybrid caching only the refresh token in SecureStore) if this product ever needs to say something stronger about on-device token security, not built now.
- One client factory, e.g. `apps/mobile/src/lib/supabase/client.ts`, exporting a singleton `supabase` client (unlike web's "create a new client per call site" note in `apps/web/src/lib/supabase/client.ts` — that note exists because web has both server and browser call sites with different cookie-reading needs; a mobile app has exactly one runtime context, so a single module-scoped client instance is the normal, simplest pattern and avoids re-creating the AsyncStorage-backed session listener repeatedly).
- TypeScript throughout, matching `apps/web` — same `@supabase/supabase-js` generated-types convention is optional/backend-engineer's call, not required by this spec.

### 1.3 Monorepo integration

- New workspace: `apps/mobile/package.json`, name `"mobile"`, picked up automatically by the root `"workspaces": ["apps/*"]` glob (§0).
- Standard Expo project layout: `app/` (Expo Router routes), `src/lib/`, `src/components/` — mirroring `apps/web/src/lib`/`src/components`'s naming so the two apps read as siblings, not unrelated codebases.
- No shared `packages/*` workspace introduced in M8 (§6 explains why logic is ported, not imported) — flagged as a reasonable follow-up refactor once real drift between the two apps' ported copies becomes an actual maintenance problem, not built preemptively now.

## 2. Navigation structure

### 2.1 Bottom tab bar — three tabs

**Decision: a bottom tab bar with three tabs — Browse, Bookings, Profile** — each tab is its own stack, so pushing a detail/sub-screen from a tab keeps that tab's back-stack independent of the others (standard Expo Router `(tabs)` group behavior, one `_layout.tsx` per tab folder).

```
┌─────────────────────────────────────────────┐
│                                                 │
│              (active tab's stack)              │
│                                                 │
├─────────────────────────────────────────────┤
│   🔍 Browse      📋 Bookings      👤 Profile   │  <- bottom tab bar
└─────────────────────────────────────────────┘
```

Justification for three tabs (not two, not four): this mirrors the web header's three logged-in nav destinations that remain in scope for M8 — "Browse listings," "Bookings," and the account/profile link (`Header.tsx`'s "My listings" link has no mobile equivalent per §4.1's scope call, and "Log out" isn't a tab, it's an action placed on the Profile screen, §5.6). Three tabs is also comfortably within the "3–5 tabs" convention every mobile design system (iOS HIG, Material) recommends before a tab bar gets cramped or needs a "More" overflow tab — not a concern here.

- **Browse tab** (`app/(tabs)/browse/index.tsx`): listing list + filters (§5.2). Pushes `app/(tabs)/browse/[id].tsx` (listing detail, §5.3) within the same stack.
- **Bookings tab** (`app/(tabs)/bookings/mine.tsx` default, `app/(tabs)/bookings/owner-requests.tsx`): §5.4/§5.5. A shared segmented-nav header lets the user switch between the two without leaving the tab (§2.3).
- **Profile tab** (`app/(tabs)/profile/index.tsx`): §5.6.

Root-level (outside the tab group, presented **modally**): `app/login.tsx`, `app/signup.tsx` — reached from any tab's logged-out gate (§3), never permanently docked to a tab of their own (there is no "Auth" tab; logging in is an interstitial action, not a destination, same as how web's `/login` is a page you pass through, not a nav-bar item once logged in).

### 2.2 Why a stack-push detail pattern (not a second-level tab or a modal) for listing detail

Listing detail (`browse/[id]`) is a normal forward `push` within the Browse tab's stack — tapping a card in a `FlatList` pushes the detail screen with a native back button/gesture to return, exactly mirroring web's `/listings` → `/listings/[id]` link-click navigation. This is the conventional, lowest-surprise pattern for a list→detail flow on mobile and needs no justification beyond "this is what every list-based mobile app does."

### 2.3 Bookings tab — two routes + a segmented sub-nav, not a single screen with an internal toggle

**Decision: two distinct Expo Router routes**, `bookings/mine.tsx` and `bookings/owner-requests.tsx`, matching web's exact `/bookings/mine` / `/bookings/owner-requests` route split (M5 §5/§6) — not one screen holding both lists behind a `useState` toggle.

```
┌─────────────────────────────────────────────┐
│  My requests   ·   Requests to me              │  <- segmented sub-nav, tap to switch
│  (bold, current)   (tap to navigate)           │
├─────────────────────────────────────────────┤
│  [booking row]                                 │
│  [booking row]                                 │
│  ...                                           │
└─────────────────────────────────────────────┘
```

Justification: this keeps 1:1 route parity with the already-shipped web app, which is directly useful to whoever maintains both going forward (same route names, same mental split between "requests I made" and "requests made to me on my listings"). The segmented strip at the top of each screen is a small shared component (two `Pressable` labels, current route rendered bold/non-interactive, the other navigating via `router.replace()` to the sibling route — `replace`, not `push`, so switching back and forth doesn't grow the back-stack) — a direct mobile port of web's M5 §8 plain-text sub-nav ("My requests · Requests to me"), same copy, same "whichever page you're on renders as plain bold text, the other as a link" behavior.
- Tab-bar tap on "Bookings" always lands on `bookings/mine` (the tab's initial route) regardless of whether the user owns any listings — same default as web's "Bookings" header link going to `/bookings/mine` (M5 §8).

### 2.4 Auth screens — modal presentation, stack-back as the "return to where I was" mechanism

`login.tsx`/`signup.tsx` are registered as modal-presented screens (Expo Router: `presentation: "modal"` in their route options) pushed from wherever a logged-out gate appears (§3). There is no `redirectTo` query param equivalent needed: because they're pushed *onto* the current tab's stack rather than replacing it, a successful login/signup simply calls `router.back()` (or, if there is no back target — e.g. the app cold-started directly into a logged-out gate — `router.replace()` to that tab's root) to return to exactly the screen the user was on, with that screen's own data re-fetched (§3.2). This is the direct RN-appropriate translation of web's `/login?redirectTo=/listings/[id]` pattern (M2 §5, M5 §3.1.B) — "come back to where you were" is expressed as stack navigation history instead of a URL query string, which is the native idiom for a stack navigator.

## 3. Auth / session handling

### 3.1 Logged-out browsing — mirrors web exactly

Per `docs/design/m5-booking-spec.md` §3.1.B, a logged-out web visitor can fully browse `/listings` and view `/listings/[id]` (including the live price estimate on the request panel) but sees a login CTA instead of a submit button. **Mobile mirrors this exactly:**

- **Browse tab**: fully usable logged out — list, filters, and listing detail all render identically to the logged-in case.
- **Listing detail screen**: the request-to-rent panel (§5.3) renders the same date pickers and live estimate for a logged-out visitor, but the submit button is replaced with a **"Log in to request this tool"** button (same copy as web) that pushes the `login` modal.
- **Bookings tab**: requesting/viewing bookings requires an account (there is nothing to show a logged-out visitor — no bookings exist without a session). A logged-out visitor tapping the Bookings tab sees a simple gate screen (not a blank list): centered text **"Log in to see your bookings."** + a **"Log in"** button (pushes the modal) + a secondary **"Sign up"** link — same idea as the listing-detail CTA, applied to a whole tab instead of one panel.
- **Profile tab**: same gate treatment — **"Log in to view your profile."** + "Log in" / "Sign up".

Justification for gating the whole Bookings/Profile tab (rather than, say, hiding those tabs entirely when logged out): keeping all three tabs always visible/tappable is simpler (no conditional tab-bar composition) and lets a curious logged-out visitor discover "oh, there's a bookings feature" and be routed straight into signing up — a small, free bit of conversion surface, consistent with why web shows the full request-to-rent panel (minus the button) to logged-out visitors instead of hiding it.

### 3.2 Return-to-previous-screen after login — mechanism

Covered in §2.4. On successful login/signup, the modal is dismissed (`router.back()`), and the screen underneath (listing detail, or the Bookings/Profile gate screen) re-renders from its own data-fetch, which now runs as the newly-authenticated user — e.g. the Bookings-tab gate screen's fetch effect re-runs once the auth state listener fires and replaces the gate with the real list, no manual "retry" affordance needed.

### 3.3 Session bootstrap on cold start (mobile-specific concern, no web equivalent)

Web reads the session synchronously from an httpOnly cookie during server rendering, so there is never a visible "checking session" gap. A mobile app restoring a session from AsyncStorage on cold start is not instant — the root layout must:

- Call `supabase.auth.getSession()` (which resolves from the AsyncStorage-persisted session) before deciding what the tab bar / gate screens should show, and subscribe to `supabase.auth.onAuthStateChange` for the lifetime of the app (login, logout, and token-refresh events all flow through this one listener — every screen reads auth state from this shared source, not its own ad hoc check).
- While that initial check is in flight, render a minimal centered loading indicator (a plain `ActivityIndicator`, no custom splash-screen animation) over the root layout — this is the one loading state this spec introduces that has no web-page analog, and it should be brief (local AsyncStorage read, not a network round trip).

## 4. Screen inventory — in scope vs. deferred

### 4.1 The big call: listing creation/editing (with photo upload) is **deferred**, not in M8

**Decision: creating and editing a listing — the M3 owner-side CRUD flow, including photo upload — is explicitly OUT of scope for M8's "asosiy ekranlar" (core screens) and deferred to a fast-follow milestone.** Everything else an owner needs to *manage bookings on an existing listing* (approve/decline requests, see who's asking, cancel an approved booking) **is** in scope (§4.2, "Owner requests").

Justification:
- **"Core screens" reads as the primary user journey, and for this marketplace that journey is renter-side.** The brief's core loop is: a renter browses, finds a tool, requests it, gets approved, picks it up, later reviews it. That entire loop — browse → filter → view detail → request with dates → see status → get approved → see owner's phone → review afterward — is fully buildable and fully valuable on mobile without listing creation touching it at all. A renter never needs to create a listing to complete the loop; an owner already can (on web, today) and does not lose that capability by M8 shipping without it on mobile.
- **Photo upload is real, mobile-specific new work, not a screen-for-screen port.** Every other in-scope M8 screen is a fairly direct port of an existing web page/flow (same fields, same validation, same copy) onto native components. Listing creation's photo step is categorically different: it requires camera-roll/camera permissions, `expo-image-picker` (or equivalent) integration, translating a picked asset's local `file://` URI into something `supabase-js`'s `storage.upload()` can accept in React Native (typically reading the file into an `ArrayBuffer`/`Blob` via `expo-file-system` or `fetch(uri).blob()` — meaningfully different from web's `<input type="file">` → `File` object path already built for `apps/web`), building a native preview grid with per-image remove, and replicating the 6-image/5MB/type-validation rules (M3 §4) using RN-appropriate APIs. This is a legitimately sized sub-feature on its own, not a thin wrapper — bundling it into "core screens" risks turning M8 into "most of M3, ported" rather than a lean second-platform launch of the parts of the product that are already load-bearing for the business (getting renters to actually use the app).
- **An owner is not blocked.** Owners already have a fully working listing-management flow on web (M3, shipped, "Done" per `MILESTONES.md`). Nothing about M8 removes or degrades that — an owner lists/edits from a laptop or the mobile browser today, and can approve/decline/manage the resulting bookings from the native app once M8 ships. That's a perfectly usable division of labor for an MVP-stage two-sided marketplace where the near-term growth lever is more likely "make it effortless for a renter to find and request a tool from their phone" than "let an owner list a ladder from their phone instead of their laptop."
- **Consistent with this app's own established pattern of shipping the narrower, higher-value slice first and flagging the rest as an explicit fast-follow** — the same reasoning M6 §1 used to defer owner-reviews-renter, and M5 §1 used to defer a speculative `cancelled_by` column: build what's demonstrably needed for the milestone's actual ask now, add the rest additively once there's real signal it's needed.
- **The counter-position, for the record (and why it's not the call made here):** one could argue an owner needs to list a tool from their phone — snapping a quick photo on-site — to make the app "usable" for the supply side. That's a legitimate product instinct for a later milestone once the renter-side loop is proven out and owner photo-upload friction is shown to actually be blocking supply growth; it is not assumed true today, and building it speculatively now is the exact kind of scope growth this spec is trying to avoid in service of the brief's explicit "fast and cheap" MVP goal.

Also deferred, as a direct consequence of the above (not a separate decision): **"My listings" (an owner's own listing list/management view) has no mobile screen in M8 at all** — not even a read-only version. A read-only "My listings" screen with no edit/delete action would be a new screen with no corresponding action, which isn't a meaningfully smaller build (it's still a new authenticated data-fetch + list screen) and has no clear user who needs *only* that (an owner who wants to see their own listings can already do so on web, where they can also act on them). Skipped entirely rather than half-built.

### 4.2 Full screen inventory

| Screen | Route | Auth? | Mirrors web |
|---|---|---|---|
| Login | `app/login.tsx` (modal) | Public | `/login` (M2 §3) |
| Signup | `app/signup.tsx` (modal) | Public | `/signup` (M2 §2) |
| Browse listings | `app/(tabs)/browse/index.tsx` | Public | `/listings` (M3 §5.4, M4) |
| Listing detail | `app/(tabs)/browse/[id].tsx` | Public (request action gated) | `/listings/[id]` (M3 §5.5, M5 §3, M6 §6) |
| My bookings (renter) | `app/(tabs)/bookings/mine.tsx` | Required (gate screen if logged out) | `/bookings/mine` (M5 §5, M6 §7) |
| Owner requests | `app/(tabs)/bookings/owner-requests.tsx` | Required (gate screen if logged out) | `/bookings/owner-requests` (M5 §6) |
| Leave a review (modal) | `app/review/[bookingId].tsx` (modal) | Required | Inline expand on `/bookings/mine` (M6 §7.2) — presented as a modal on mobile instead, see §5.4.2 |
| Profile | `app/(tabs)/profile/index.tsx` | Required (gate screen if logged out) | `/profile` (M2 §4) |

**Deferred (explicitly out of scope for M8):**
- Create listing (`/listings/new` equivalent) — §4.1.
- Edit listing (`/listings/[id]/edit` equivalent) — §4.1.
- My listings (`/listings/mine` equivalent) — §4.1.
- Password reset — never built on web either (M2 §3's explicit stub); mobile stays consistent with that, same "Forgot password? (coming soon)" non-interactive stub.

## 5. Screen-by-screen spec

### 5.1 Login / Signup — `login.tsx` / `signup.tsx`

Direct field-for-field port of M2 §2/§3 — same fields, same client-side validation rules, same error-copy mapping (generic "Invalid email or password." for login; "An account with this email already exists. Try logging in instead." / "Password must be at least 6 characters." / generic fallback for signup), same submit-button labels ("Log in" / loading "Logging in…", "Sign up" / loading "Signing up…"). Standard RN form: `TextInput` (email: `keyboardType="email-address"`, `autoCapitalize="none"`; password fields: `secureTextEntry`).

- On success: dismiss per §2.4/§3.2 (`router.back()`, falling back to the relevant tab root).
- "Forgot password?" — same non-interactive stub as web, plain dimmed text, no link.
- Footer links ("Already have an account? Log in" / "Don't have an account? Sign up") navigate between the two modals via `router.replace()` (swap one modal for the other, not stack them).

### 5.2 Browse listings — `(tabs)/browse/index.tsx`

- Header: "Browse listings" (matches web copy).
- **Data**: `listings` where `status = 'published'`, same filters as M4 §4's AND-combined query (category, location substring, price range scoped to one `price_unit`), `order by created_at desc`, same `INDEX_LIMIT`-style cap ported from web (`60`) — no "load more"/infinite scroll for M8, same as web's own M4 §12 non-goal.
- **Layout**: a single-column vertical `FlatList` (not a multi-column grid — a phone-width viewport is the mobile equivalent of web's own `grid-cols-1` mobile breakpoint, M4 §11; no need to invent a 2-column phone layout web itself doesn't use at that width). Each row/card: cover-photo thumbnail (or the ported `ImagePlaceholder` equivalent — a plain gray box with the listing's first letter, same M3 §5.4/§9 rule) on the left, title / formatted price (`formatPrice`, "$X.XX / unit") / location stacked on the right — same information as web's `ListingCard`, category omitted from the card exactly as web already treats it as optional-and-skipped (M3 §5.4).
- **Filters**: a filter panel above the list, toggled open/closed by a **"Filters"** button (a collapsible panel rather than always-visible, since a phone screen doesn't have the horizontal room web's filter bar assumes, M4 §2) containing:
  - Category — a `SelectField` (§6.2) listing the 14 `LISTING_CATEGORIES` plus "All categories".
  - Location — a plain `TextInput`, same substring-match semantics as web (M4 §5) — matching is server-side (`ilike`), unchanged.
  - Price min / max — two `TextInput`s, `keyboardType="decimal-pad"`.
  - Price unit ("Per") — a `SelectField` with `hour`/`day`/`week`, default `day`, same "only applied if min or max is set" rule as web (M4 §6).
  - **"Apply filters"** primary button, **"Clear filters"** text link (shown only when a filter is active, same condition as web M4 §9).
  - **Decision: filters are held in local screen state (`useState`), not encoded into the route's URL/query params**, unlike web's URL-param-driven design (M4 §3). Justification: web's URL-param approach exists specifically so a filtered view is a shareable/bookmarkable browser URL — there is no address bar to share on mobile, and Expo Router's query-param support would be adding real complexity (parsing/validating `useLocalSearchParams`, keeping form state and route state in sync) purely to replicate a browser affordance that doesn't exist here. Local state + a refetch on "Apply filters" is simpler and delivers the same filtering behavior/semantics (§4 of M4 unchanged — same AND logic, same validation-as-absent-filter rule for malformed input) without the shareable-URL machinery web needed it for.
- **Empty states**: ported verbatim from M4 §8 — platform-wide empty ("No listings yet." + a CTA, logged-in → nothing to push since there's no create-listing screen in M8 scope, so this CTA is simply omitted on mobile, see note below) vs. filtered-empty ("No tools match your filters." / "Try adjusting your search." / "Clear filters").
  - Note: web's platform-wide-empty CTA links to `/listings/new` (logged in) or `/signup` (logged out) — since `/listings/new` has no mobile screen (§4.1), the mobile empty state shows no CTA at all when logged in (just the plain message), and still shows a "Sign up" link when logged out (that part carries over unchanged).
- **Pull-to-refresh**: standard `FlatList` `RefreshControl` — a normal native list convention with no web equivalent to preserve consistency with; added because it's the expected, near-zero-cost native affordance for "get the latest listings," not a new product decision.

### 5.3 Listing detail — `(tabs)/browse/[id].tsx`

Same vertical content order as `apps/web/src/app/listings/[id]/page.tsx` (confirmed against the shipped file), adapted to a scrollable native screen (`ScrollView`):

```
[ cover photo, full-width, 16:9 ]
[ small horizontal thumbnail strip, remaining photos — if any ]

Title                                    [Edit listing]  <- omitted entirely, §4.1
$25.00 / day
Power Tools · Etobicoke, ON
★★★★★ 4.6 (12 reviews)   — or "No reviews yet"

[ description, wrapped plain text ]

—————————————————————
[avatar] Owner full name
         City

—————————————————————
[ Request-to-rent panel — or "Log in to request" / "This is your listing." note ]

—————————————————————
Reviews (12)
[ review row ]
[ review row ]
...
```

- **Data fetch**: identical set of queries to the web page — `listings` row, `listing_images` (signed URLs), owner via `public_profiles`, `reviews` joined to `public_profiles` for reviewer names, aggregate computed client-side from the same result set (no pagination, same as web M6 §6.2).
- **"Edit listing" link**: not rendered on mobile at all, even for the owner viewing their own listing (§4.1 — there is no edit screen to link to). The owner still sees the same "This is your listing." note in the request-panel slot (below), which is the one piece of owner-specific UI that *does* carry over, since it's just a note, not an editing entry point.
- **Request-to-rent panel** — three states, same conditions as web M5 §3.1:
  - **A. Logged in, not the owner**: date pickers (§5.3.1) + live estimate (§5.3.2) + **"Request to rent"** button (loading: "Sending request…").
  - **B. Logged out**: identical date pickers/estimate, submit button replaced with **"Log in to request this tool"** (pushes the login modal, §2.4/§3.2).
  - **C. Owner viewing own listing**: plain text **"This is your listing."** + a link **"View requests"** that switches to the Bookings tab, `owner-requests` route (`router.push` into the Bookings tab stack — Expo Router supports cross-tab navigation to a specific nested route).
- **Reviews list**: same ordering/empty-state copy as web M6 §6.2/§8 ("Reviews ({count})" heading, "No reviews yet — be the first to rent this and leave one." empty body), each row: reviewer name, star rating, formatted date, comment if present.

#### 5.3.1 Date inputs — native date picker, whole-day granularity (unchanged rules)

**Decision: `@react-native-community/datetimepicker`** (`mode="date"`) for start/end date fields — the direct RN-appropriate equivalent of web's native `<input type="date">` choice (M5 §3.2's own reasoning: use the platform's own accessible picker UI rather than build a custom calendar-grid widget). This is a single, near-ubiquitous, Expo-compatible package wrapping each OS's actual native date picker (a spinner/calendar sheet on iOS, a calendar dialog on Android) — not a hand-built or third-party styled calendar component, consistent with the "no calendar-grid widget" non-goal carried over from M5 §10.

- Same field rules as M5 §3.2: `start_date` cannot be before today; `end_date` cannot be before the selected `start_date`; same-day (`start_date === end_date`) is a valid 1-day booking; same inline validation copy ("End date must be on or after the start date.") if the state ever becomes invalid.
- Presented as two tappable fields (styled like text inputs, showing the currently selected date, e.g. "Aug 12, 2026") that open the native picker on tap — not two always-visible inline calendar widgets, to conserve vertical space on a phone screen.

#### 5.3.2 Estimated price display — same formulas, ported pricing module

Same three `price_unit` cases and exact copy as M5 §3.3 (day: exact total; week: rounded-up-to-full-weeks with the "Rounded up to the nearest full week." subtext; hour: rate-only, "$15.00 / hour — total cost depends on hours used. Confirm the total with the owner."). The day-count/estimate/money-formatting functions in `apps/web/src/lib/bookings/pricing.ts` are plain TypeScript with no DOM/React dependency — **port them verbatim** (character-for-character identical formulas) into `apps/mobile/src/lib/bookings/pricing.ts` rather than reimplementing from the spec text, to guarantee the two apps compute the same number for the same inputs. Same note applies to `apps/web/src/lib/listings/categories.ts` (category list + `formatPrice`) and the `StatusBadge`/`StarRating` color/logic — ported as plain TS/RN modules, not imported from a shared package (§0/§1.3 already note why no shared workspace is introduced in M8).

#### 5.3.3 Submit behavior

Same guards/copy as M5 §3.4 (session-expired, own-listing rejection, past-date rejection, availability-conflict copy — "Those dates aren't available — this tool is already booked then. Please choose different dates."). On success: navigate to the Bookings tab's `mine` route (equivalent of web's `redirect('/bookings/mine?requestSent=1')`) — Expo Router doesn't have a query-flag convention the way a browser URL does, so the mobile equivalent is a **local navigation param** (`router.push({ pathname: "/(tabs)/bookings/mine", params: { requestSent: "1" } })`) read once by the target screen to show the same green confirmation banner text ("Request sent! The owner will respond soon.") and then cleared from route params so it doesn't reappear on a later revisit — the direct RN-appropriate translation of the `?requestSent=1` query-flag pattern.

### 5.4 My bookings (renter) — `(tabs)/bookings/mine.tsx`

- Segmented sub-nav at top (§2.3), "My requests" bold/current.
- If navigated to with `requestSent=1` param (§5.3.3): green confirmation banner, "Request sent! The owner will respond soon." (auto-dismiss on next screen focus, or a small "×" to dismiss — engineer's call, not load-bearing).
- **Data**: same query as M5 §5 — `bookings` where `renter_id = current user`, ordered `created_at desc`, joined to `listings` for title/cover/price.
- **Row**: cover thumbnail, title, date range (e.g. "Aug 12 – Aug 16, 2026"), computed estimate, `StatusBadge` (§6.1), and one of the following in the row's lower slot, in priority order (direct port of web M5 §5 + M6 §7.1's three-state contact/review slot):
  1. **Cancel available** (`pending` or `approved`): a **"Cancel request"** text button. Tapping shows a native `Alert.alert()` confirm dialog — the RN equivalent of web's `confirm()` (M3 §5.2/M5 §5) — title/body: "Cancel this booking request?" / "This cannot be undone." On confirm: `cancelBooking(bookingId)`, same re-check-ownership-server-side pattern, then refetch the list in place.
  2. **Approved, contact visible** (`status = 'approved'`): the M5 §3.5 contact line — "Contact: {full_name}, {phone}" + "Arrange pickup and payment directly." (or the no-phone-on-file fallback copy) — rendered above/alongside the Cancel button, not instead of it (both can show simultaneously on an ongoing approved booking, exactly as on web).
  3. **Eligible to review** (`status = 'approved'` AND `end_date < today` AND not yet reviewed, same predicate as M6 §2): a **"Leave a review"** text button. Tapping it pushes the review modal (§5.4.2) — see below for why this is a modal push on mobile rather than web's inline-expand.
  4. **Already reviewed**: read-only mini display — star rating + "Your review" label + comment if present. No edit/delete (M6 §4's immutability decision, unchanged).
  5. **Not eligible / terminal** (`pending`/`declined`/`cancelled`, or `approved` but not yet past `end_date` with no other slot content applicable): nothing extra renders.
- **Empty state**: "You haven't requested to rent anything yet." + a **"Browse listings"** button that switches to the Browse tab.

#### 5.4.1 Owner requests — `(tabs)/bookings/owner-requests.tsx`

Direct port of M5 §6: segmented sub-nav ("Requests to me" bold/current), two sections **"Pending requests"** (with **Approve**/**Decline** buttons, no confirm dialog on either — same "easily correctable, no dialog needed" reasoning as web) and **"History"** (status badge instead of buttons, contact info on `approved` rows, a **Cancel** action still available on `approved` rows per M5 §1's transition table). Same inline error-under-the-row treatment if an approval fails the checkpoint-2 overlap re-check (M5 §4), same copy: "Couldn't approve — these dates were just booked by another approved request. Decline this request or ask the renter to choose different dates." Same empty state: "No booking requests yet." + "Requests to rent your listings will show up here." (no CTA link, same as web — there's no create-listing screen to link to on mobile either, consistent with §4.1).

#### 5.4.2 Leave-a-review — `app/review/[bookingId].tsx` (modal), not an inline row-expand

**Decision: presented as a small modal screen**, pushed from the "Leave a review" button on a `bookings/mine` row, rather than web's M6 §7.2 inline-expand-within-the-row pattern.

Justification: web's inline expand works because a plain DOM `<div>` reflows the page around it for free. The equivalent in a `FlatList` — growing one row's height in place — needs either `FlatList`'s more fragile dynamic-item-height/measurement handling or a switch to a non-virtualized list, both real added complexity for a five-field form that doesn't need to coexist visually with the rest of the list anyway. A modal screen (native RN concept: `presentation: "modal"`) is the standard, low-friction mobile pattern for "a short, focused input task launched from a list row" and preserves the exact same content/behavior — same heading ("Rate this rental"), same interactive `StarRating` (§6.3) five-tap star row with no default selection, same optional `TextInput` comment capped at 500 chars with a live "{length}/500" counter, same **"Submit review"** (loading: "Submitting…") / **"Cancel"** pair, same server-side guard copy from M6 §7.2 (session-expired, not-eligible, duplicate-review, no-rating-chosen, comment-too-long). On successful submit: dismiss the modal (`router.back()`) and refetch the `bookings/mine` list so the row now shows state 4 ("Your review: ★★★★★...") — same "the row visibly flipping is sufficient feedback, no separate banner" reasoning as web M6 §7.2.

### 5.5 Profile — `(tabs)/profile/index.tsx`

Direct port of M2 §4: read-only "Signed in as {email}" line at top, then an always-editable form (no separate view/edit toggle, matching web's "recommended minimal approach") — Full name, Avatar URL (`url`/text input; if it looks like a URL, show a small `<Image>` preview, fail silently via `onError`→hide, same as web), Phone (with the same "Only visible to you for now." helper note), City. Single **"Save changes"** button (loading: "Saving…"), same generic error copy ("Could not save changes. Please try again.") and a same-shape success confirmation (a small dismissable "Profile updated." banner in place of web's `?saved=1` query-flag banner — same local-nav-param mechanism as §5.3.3 if implemented via navigation, or simply local component state set after a successful mutation, since this screen doesn't need to navigate anywhere to show it).

- **Log out**: a button at the bottom of the Profile screen (there is no persistent header nav on mobile to hold this the way web's `Header.tsx` does) — same behavior as M2 §1 ("Log out"): immediately sign out, no confirmation dialog, then navigate to the Browse tab (mobile's equivalent of web's redirect to `/`, since there's no true "home" screen distinct from Browse in this app's mobile IA — Browse is the first, publicly-usable tab, matching M2's "logged out lands on a usable page" spirit).

### 5.6 Shared: `StatusBadge` and `StarRating` ports

Both are ported as small RN presentational components (a `View`+`Text` pill for `StatusBadge`, a row of `Text` "★"/"☆" glyphs — optionally wrapped in `Pressable` for the interactive review-form case — for `StarRating`), preserving the exact same semantics/colors as their web counterparts (§6.1/§6.3 give the concrete RN color values). No new icon library, no SVG — same "Unicode star glyphs, no dependency" decision as web M6 §9, which ports to RN without modification (`Text` renders Unicode glyphs identically to a browser `<span>`).

## 6. Shared components / design-token porting

### 6.1 `StatusBadge` — same four statuses, same meaning, RN color values

Direct port of M5 §7's table, translated from Tailwind utility classes to explicit RN style values (light mode; dark-mode variants follow the same background-tint/foreground-tint pairing used in the Tailwind `dark:` classes, applied via `useColorScheme()`, §7.2):

| Status | Label | Background | Text |
|---|---|---|---|
| `pending` | "Pending" | `#fef3c7` (amber-100) | `#92400e` (amber-800) |
| `approved` | "Approved" | `#dcfce7` (green-100) | `#166534` (green-800) |
| `declined` | "Declined" | `#fee2e2` (red-100) | `#991b1b` (red-800) |
| `cancelled` | "Cancelled" | `#f4f4f5` (zinc-100) | `#52525b` (zinc-600) |

Shape: a pill (`borderRadius: 9999`, small horizontal/vertical padding matching web's `px-2.5 py-0.5`), small/medium-weight text — same visual weight as web's badge, no icons.

### 6.2 `SelectField` — the RN equivalent of a native `<select>`

**Decision: a small reusable modal-list picker component**, not `@react-native-picker/picker` (whose inline-wheel-vs-dialog rendering differs meaningfully between iOS and Android, which is more inconsistency than a 3–14-option MVP filter needs) and not a platform `ActionSheet` (iOS/Android have different native action-sheet idioms, meaning two implementations to keep behaviorally aligned). `SelectField` renders as a tappable field showing the current selection (or a placeholder, e.g. "All categories" / "Select a category"), and tapping it opens a simple full-height or half-height `Modal` containing a scrollable list of options (`FlatList`, one row per option, current selection checked/highlighted, tap to select and auto-close). This is the single new visual primitive this spec introduces beyond `StatusBadge`/`StarRating` — used for category (14 + "all") and price-unit (3) selection everywhere a web `<select>` appears in the ported flows (browse filters, §5.2). Kept deliberately minimal: no search/type-ahead inside the list (unnecessary at 14 options), no multi-select.

### 6.3 `StarRating` — RN color values

Same Unicode-glyph approach as web M6 §9: filled `★` in `#f59e0b` (amber-500), empty `☆` in `#d4d4d8` (zinc-300) / `#52525b` (zinc-600) in dark mode. Read-only mode: five `Text` glyphs, filled count = `Math.round(rating)` (fractional aggregate) or the exact integer (single review). Interactive mode (review-form only): five `Pressable`-wrapped glyphs, `onPress(n)` reports 1–5 up to the parent's state, no pre-selected value.

### 6.4 `ImagePlaceholder`

Same rule as web M3 §9: a plain light-gray box (`#f4f4f5` light / a dark-gray equivalent) showing the listing's first letter centered, no stock photo, no external placeholder-image service — used anywhere a listing has zero photos (browse rows, listing detail, booking rows).

## 7. Visual style — shared color palette and spacing scale

Per the task's instruction to keep visual style consistent across web and mobile, this section defines the concrete token values a mobile-engineer should use — sourced directly from `apps/web/src/app/globals.css` and the Tailwind utility classes already established across M2–M7, translated into plain RN `StyleSheet` values (no Tailwind engine assumed by default; see the NativeWind note below).

### 7.1 Color tokens

| Token | Light | Dark |
|---|---|---|
| `background` | `#ffffff` | `#0a0a0a` |
| `foreground` (primary text) | `#171717` | `#ededed` |
| `border` | `rgba(0,0,0,0.08)` | `rgba(255,255,255,0.145)` |
| `muted text` (`zinc-500`/`zinc-400`) | `#71717a` | `#a1a1aa` |
| `error text` (`red-600`) | `#dc2626` | `#dc2626` |
| `success text` (`green-600`) | `#16a34a` | `#16a34a` |
| Primary button background/text | `foreground` bg / `background` text (i.e. solid dark-on-light in light mode, light-on-dark in dark mode) — matches web's "Sign up" / "Publish listing" button treatment | same, inverted |
| Status-badge / star colors | see §6.1/§6.3 | see §6.1/§6.3 |

Dark mode is driven by the OS setting (`useColorScheme()` from `react-native`), matching web's `@media (prefers-color-scheme: dark)`-only approach — **no manual in-app theme toggle**, consistent with web never building one either.

### 7.2 Spacing / radius scale

- Base spacing unit: 4px (matches Tailwind's default scale, which every web screen in this app already uses) — common paddings/gaps used throughout the ported screens are 8/12/16/24px, mirroring the `p-2`/`p-3`/`p-4`/`p-6` classes seen repeatedly across the web specs' styling-notes sections.
- Card/panel corner radius: 16px (`rounded-2xl`, the app's standard card radius — request panel, listing detail image, booking rows, review rows).
- Small element radius (thumbnails, inputs): 8px (`rounded-lg`).
- Pill/button radius: 9999 (fully rounded — status badges and the primary action buttons, matching web's `rounded-full` buttons).

### 7.3 Styling engine — recommendation, not a hard requirement

**Recommendation: NativeWind** (Tailwind-syntax utility classes for React Native) is a reasonable choice to minimize the mental-model gap for whoever builds this — the same `className="rounded-2xl border border-black/[.08] p-4"` reasoning already used throughout the web specs' styling-notes sections can be carried over close to verbatim. This is **not a hard requirement**: a plain `StyleSheet.create()` approach using the token table in §7.1/§7.2 achieves the identical visual result and is equally acceptable — the engineer's call, since it doesn't change what gets built, only how the styles are authored. Either way, **no new UI component library** (no React Native Paper, no NativeBase, no UI kit) — consistent with every prior milestone's "minimal custom components, no component library" convention; the few new visual primitives this spec introduces (`StatusBadge`, `StarRating`, `SelectField`) are small, hand-built, plain-styled components, same spirit as web's own `StatusBadge`/`StarRating`.

## 8. Loading / error / empty-state conventions

- **Loading**: every data-fetching screen shows a centered `ActivityIndicator` while its initial fetch is in flight (the RN equivalent of web's server-rendered "no client spinner needed" — mobile has no server-render step, so an initial spinner is the honest mobile-appropriate substitute, not a design regression from web's near-zero-loading-state approach).
- **Pull-to-refresh** on all list screens (Browse, My bookings, Owner requests) — a native list-screen convention with no web-page analog, added because it's the expected near-zero-cost affordance, not a new product decision (§5.2).
- **Errors**: inline, red (`#dc2626`), same message copy as the corresponding web spec wherever one exists — no toast library introduced; a `View` banner or inline `Text` under the relevant form/action, matching web's "inline error area" convention throughout M2–M6.
- **Confirmation dialogs** (cancel booking, in future any destructive action): native `Alert.alert()` — the direct RN equivalent of web's `confirm()` (§5.4).

## 9. Environment / config

- Standard Expo pattern: `apps/mobile/app.config.ts` reads `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` from `apps/mobile/.env.local` (gitignored, same convention as `apps/web/.env.local`) via Expo's built-in `EXPO_PUBLIC_`-prefix env-var support (any env var with that prefix is automatically inlined into the client bundle at build time — no extra dotenv wiring needed).
- **These are the exact same values already in `apps/web/.env.local`** (`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`, just re-prefixed for Expo's convention) — the mobile app talks to the **same real Supabase project** web already uses, not a second/parallel project. Add the `EXPO_PUBLIC_...` pair to the root `.env.example` alongside the existing `NEXT_PUBLIC_...`/`SUPABASE_SERVICE_ROLE_KEY` entries, for discoverability.
- These are public, anon-role keys — already shipped inside `apps/web`'s client JS bundle today (readable by anyone who opens browser devtools), so putting the same values inside a compiled mobile app bundle is not a new secret-handling concern; it's the same public-key model Supabase's anon key is designed for (the real access boundary is Postgres RLS, unchanged by this spec).
- Same "test against local dev Supabase, don't touch remote from automated agents" convention as every prior milestone (§0) — local dev work points at the local Supabase instance, same as web.

## 10. Non-goals (explicit)

- **Listing creation / editing (photo upload)** — considered at length and explicitly deferred, see §4.1's full justification. Not partially built (no stub screen, no "coming soon" placeholder screen — simply absent from the tab bar and from the listing-detail owner note).
- **"My listings" (owner's own listing list) screen, even read-only** — a direct consequence of the above, see §4.1's closing note.
- **Payment / checkout** — per `PROJECT_BRIEF.md`, unchanged from every prior milestone; no price capture beyond the read-only estimate (§5.3.2).
- **In-app messaging / chat** — out of scope, same as web through M6+; phone-number reveal on `approved` bookings (M5 §3.5, ported unchanged in §5.4) remains the only contact mechanism.
- **Push notifications** — the web app has no notification system at all (M5 §10, M6 §10 both explicitly declined this); mobile stays consistent rather than introducing a notification capability web itself doesn't have. A user finds out about a status change by reopening the app and revisiting Bookings, same as web's "revisit the app" model.
- **Offline support** — no local caching/sync, no offline-queued actions (e.g. no "your cancel will sync when back online"). Every action requires connectivity; a failed request due to no network shows the same generic inline error copy as any other failure.
- **Tablet-specific layout** — phone-first only, same "fast and cheap MVP" reasoning web used for not building a dedicated desktop-vs-mobile bespoke layout beyond ordinary responsive breakpoints (M4 §11, M7). iPad/Android-tablet users get the same phone-width layout, unoptimized for the extra space — acceptable for MVP.
- **App Store / Play Store submission, build signing, store listings, TestFlight/internal-testing distribution setup** — that is M10's scope. M8 delivers working screens runnable via Expo Go or a local dev build; no store-facing work is included here.
- **Password reset flow** — never built on web (M2 §3's explicit non-goal/stub), mobile stays consistent, same non-interactive "Forgot password? (coming soon)" stub.
- **Keyword/full-text search** — never built on web either (M4 §1's explicit non-goal), mobile doesn't add one.
- **A shared `packages/*` logic workspace between `apps/web` and `apps/mobile`** — pure-logic modules are ported (copied, kept formula-identical) rather than extracted into a shared package for M8, see §1.3/§5.3.2. Flagged as a reasonable future refactor once real drift becomes a maintenance problem, not built preemptively.
- **URL-param-driven/shareable filter state on the Browse tab** — local screen state instead, see §5.2's justification (no browser address bar to make shareable on mobile).
- **A manual light/dark theme toggle** — OS-driven only (`useColorScheme()`), matching web's `prefers-color-scheme`-only approach (§7.1).

## 11. Copy reference

Nearly all user-facing copy in this spec is reused **verbatim** from the corresponding web spec — see each screen's section above for the exact string and its source (M2 §6, M5 §11, M6 §11). The only copy genuinely new to M8 (no web equivalent) is:

- Bookings-tab logged-out gate: "Log in to see your bookings."
- Profile-tab logged-out gate: "Log in to view your profile."
- Browse-tab filter toggle button: "Filters"
- Category picker placeholder: "All categories" (list screen) / "Select a category" (n/a — no create form on mobile, so this placeholder variant doesn't actually appear in M8; noted for completeness only in case a future listing-creation milestone reuses `SelectField`)

Everything else — button labels, validation messages, empty-state copy, status-badge labels, error copy, the request-to-rent panel's three states, the review form, the contact-info line — is the exact same string already specified in `docs/design/m2-auth-spec.md` §6, `docs/design/m5-booking-spec.md` §11, and `docs/design/m6-reviews-spec.md` §11. Engineers should pull copy from those sections directly rather than re-deriving it, to guarantee the two platforms read as the same product.

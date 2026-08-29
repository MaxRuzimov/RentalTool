# M3 — Tool Listings UX/UI Spec (Create, Edit, My Listings, Public View)

Status: ready for implementation
Scope: `apps/web` (Next.js 16 App Router + Tailwind v4), Supabase Postgres + Storage
Non-goals for M3: search/filtering (M4), booking/contact-owner flow (M5), reviews (M6), listing moderation/admin tooling, mobile (Expo app — later milestone), any online payment.

## 0. Assumptions engineers should verify before starting

- M2 auth is merged: `profiles` table + RLS, `public_profiles` view, Supabase server/browser clients (`apps/web/src/lib/supabase/{client,server}.ts`), and the shared `<Header>` all exist and work as documented in `docs/design/m2-auth-spec.md`.
- `profiles.city` is a plain free-text column with no geo validation — this spec reuses that exact convention for `listings.location`. Do not introduce PostGIS, lat/lng columns, or GTA-only constraints; the brief calls for a horizontal, not-geo-fenced-in-schema marketplace.
- Supabase Storage is available in this project (it is part of the standard Supabase stack per the brief) but no bucket has been created yet — creating the `listing-images` bucket and its storage policies is part of this milestone's backend work, not a prerequisite already done.
- Server actions + `useActionState`-style form state (see `ProfileForm.tsx` / `actions.ts`) is the established mutation pattern in this repo; listing forms should follow the same shape (a client form component + a `"use server"` actions file returning `{ status, message }`).
- No listing data exists yet, so every screen in this spec has a real, reachable empty state (not just theoretical).

## 1. Data model — `listings` table (spec only; SQL/RLS is the backend engineer's implementation)

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | `uuid`, PK, default `gen_random_uuid()` | yes | |
| `owner_id` | `uuid`, references `auth.users(id)` on delete cascade | yes | Set from the authenticated user server-side, never from client input |
| `title` | `text` | yes | Max 100 chars (enforced client + `check` constraint) |
| `description` | `text` | yes | Max 2000 chars |
| `category` | `text` (or Postgres `enum`) | yes | One of the fixed category list in §2 — backend engineer's call whether to use a Postgres `enum` type or a `check (category in (...))` constraint; either satisfies this spec |
| `price_amount` | `numeric(10,2)` | yes | Must be `> 0` |
| `price_unit` | `text` | yes | One of `hour`, `day`, `week` (see below) |
| `location` | `text` | yes | Free text, same convention as `profiles.city` (e.g. "Etobicoke, ON") — no structured address, no geocoding |
| `status` | `text`, default `'published'` | yes | See "Draft vs. published" decision below |
| `created_at` | `timestamptz`, default `now()` | yes | |
| `updated_at` | `timestamptz`, default `now()` | yes | Maintained by the same `set_updated_at()` trigger pattern already used on `profiles` |

Images are **not** a column on `listings` — see §4 for the separate `listing_images` table/Storage approach.

### Price unit

Fixed set for MVP dropdown: **`hour`**, **`day`**, **`week`**. Default selection: `day` (matches how most tool-rental pricing is normally advertised). No custom/free-text unit, no monthly unit for MVP (rare enough to skip; can be added later without a schema break since it's a plain text/enum value).

### Draft vs. published — decision

**Out of scope for M3.** Every listing a user creates is immediately live (`status = 'published''` by default, hard-coded, not exposed as a choice in the UI). Rationale: a draft/publish toggle adds a second state machine, an extra UI control, and an extra query filter everywhere listings are read — for a "fast and cheap MVP" with no moderation queue anyway, there's no real workflow reason to hold a listing back before showing it. The `status` column is still included in the schema (rather than omitted entirely) so that a future "unpublish"/"mark as rented"/"archive" affordance can be added later as a pure UI change with no migration. For M3, the only UI implication of `status` is the delete flow in §5.3 (see below) — no "Draft" badge, no publish button.

## 2. Categories (fixed list, dropdown only — not user-created)

Single `<select>`, required, no "create new category" option. Fixed list for MVP:

1. Power Tools
2. Hand Tools
3. Ladders & Access
4. Lawn & Garden
5. Cleaning & Pressure Washers
6. Generators & Power
7. Automotive
8. Construction & Heavy Equipment
9. Painting
10. Plumbing
11. Electrical
12. Moving & Hauling
13. Party & Event
14. Other

14 categories — broad enough to cover common horizontal tool-rental inventory without over-fragmenting a small early catalog. "Other" is the catch-all/escape hatch so no listing is ever blocked by missing a category. This list lives as a single shared constant (e.g. `apps/web/src/lib/categories.ts`) imported by the form, the DB check constraint/enum, and (later, M4) any filter UI — not duplicated.

## 3. Screens overview

| Route | Auth? | Purpose |
|---|---|---|
| `/listings` | Public | Minimal unfiltered index of all published listings |
| `/listings/[id]` | Public | Single listing detail view |
| `/listings/new` | Required | Create a listing |
| `/listings/[id]/edit` | Required (owner only) | Edit an existing listing |
| `/listings/mine` | Required | Current user's own listings, with edit/delete |

### Why `/listings` and `/listings/[id]` are in scope for M3, not deferred to M4

M4 is about search/filtering *on top of* an existing browsable set of listings. Without a bare index page and a detail page, a listing created in M3 would be completely unreachable by anyone except its owner (via `/listings/mine`) — there'd be nothing to demo or validate end-to-end. So M3 includes the simplest possible versions of both: `/listings` is an unfiltered, unpaginated (or trivially paginated, see §5.4) list ordered by `created_at desc`, and `/listings/[id]` shows listing info + owner's public name/city via `public_profiles`, with **no** contact/message/booking UI (that's M5) and **no** search box, category filter, or sort control (that's M4).

## 4. Image upload

### Storage model

- Bucket name: `listing-images` (public read bucket — listing photos are meant to be publicly visible, same trust level as the listing text itself).
- Path convention: `{owner_id}/{listing_id}/{filename}` — matches the RLS-friendly, path-based policy pattern implied by the repo's existing profiles RLS (owner-scoped writes). Storage policies (backend engineer's implementation, not this spec): INSERT/DELETE allowed only when `(storage.foldername(name))[1] = auth.uid()::text`; SELECT allowed to everyone (public bucket).
- A separate `listing_images` table tracks image rows explicitly rather than only relying on Storage listing, so ordering (see "primary image" below) and cascading delete are simple SQL, not Storage API calls:

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | `uuid`, PK, default `gen_random_uuid()` | yes | |
| `listing_id` | `uuid`, references `listings(id)` on delete cascade | yes | |
| `storage_path` | `text` | yes | e.g. `{owner_id}/{listing_id}/{filename}` — full path within the `listing-images` bucket |
| `position` | `int` | yes | 0-based order; position `0` is the primary/cover image |
| `created_at` | `timestamptz`, default `now()` | yes | |

### Limits and constraints

| Rule | Value |
|---|---|
| Max images per listing | 6 |
| Max file size per image | 5 MB |
| Accepted types | `.jpg`/`.jpeg`, `.png`, `.webp` (validate both file extension and `file.type` client-side; real MIME/type enforcement is a Storage bucket policy, backend engineer's job) |
| Minimum images required to publish | 0 — images are optional. A listing with zero photos is allowed (better to let someone list with a placeholder-style card than block them entirely for a fast MVP), but the create form nudges with helper text: "Listings with at least one photo get far more interest — add one if you can." |

### Primary/cover image

Simplest possible rule, no separate "set as cover" picker: **the image in `position = 0` (i.e., first in upload/display order) is always the cover image**, shown on `/listings/mine` cards, `/listings` cards, and as the large image on `/listings/[id]`. Users control which image is primary purely by reordering (see interaction below) or by upload order.

### Upload UX (create and edit forms — identical behavior)

- A single file `<input type="file" multiple accept="image/jpeg,image/png,image/webp">` (styled as a dashed drop-zone box with "Add photos" label) triggers a native multi-select file picker.
- Selecting files appends them to a client-side preview grid (thumbnails in a responsive grid, e.g. 3 columns on mobile / 6 on desktop) below the input. Each thumbnail has a small "×" remove button in the corner.
- Client-side validation on selection, per file: reject (with an inline message, e.g. "photo3.png is larger than 5MB — skipped.") anything over 5MB or not an accepted type; silently skip rather than block the whole batch.
- Enforce the 6-image cap client-side: if the user has already selected/has 6 images, disable the "Add photos" control and show "Maximum 6 photos." Attempting to select more when at the cap shows an inline note and simply ignores the excess files beyond the cap.
- Reordering: **not built for M3** — drag-to-reorder is a nice-to-have, not essential for a fast MVP where "first uploaded = cover" is intuitive enough. Users who want a different cover photo can remove and re-add in the desired order. (Noted as a deliberate scope cut, not an oversight.)
- Removing an image: click "×" on a thumbnail. If the image was already saved (edit mode, already has a `listing_images` row), removal is queued and only actually deleted from Storage + the table on form submit (so a user can back out without side effects by navigating away without saving). If the image was newly added this session (not yet uploaded), removal just drops it from the in-memory list — no network call.
- On form submit: newly added files are uploaded to Storage under `{owner_id}/{listing_id}/{uuid-filename}` and a `listing_images` row inserted per file (in current display order → `position` 0..n); files marked for removal are deleted from Storage and their rows deleted. All of this happens inside the same submit action as the rest of the listing fields (single "Save"/"Publish" button — no separate "upload photos" step).
- Uploading indicator: while files are being read/uploaded, show "Uploading photos…" near the grid and disable the submit button (in addition to the normal "Saving…" state) — for MVP it's acceptable for photo upload and row save to be sequential within one server action rather than optimized/parallelized.

## 5. Screens (detailed)

### 5.1 Create listing — `/listings/new` (auth required)

#### Fields

| Field | Input type | Required | Notes |
|---|---|---|---|
| Title | `text`, name=`title` | yes | Max 100 chars, `maxLength` attribute + helper "X/100" character count is optional polish, not required |
| Description | `textarea`, name=`description` | yes | Max 2000 chars, ~6 rows |
| Category | `select`, name=`category` | yes | Options from §2, no default selected — placeholder option "Select a category" forces an explicit choice |
| Price amount | `number`, name=`price_amount`, `min="0.01"` `step="0.01"` | yes | Rendered with a leading "$" label, no currency selector (CAD implied, matches GTA/Canada scope) |
| Price unit | `select`, name=`price_unit` | yes | `hour` / `day` / `week`, default `day` |
| Location | `text`, name=`location` | yes | Placeholder "e.g. Etobicoke, ON" — same free-text convention as profile city |
| Photos | file input + preview grid | no | See §4 |

#### Validation (client-side, before submit)

- Title: non-empty after trim, ≤100 chars.
- Description: non-empty after trim, ≤2000 chars.
- Category: must be one of the fixed list (native `required` on `<select>` with empty placeholder value).
- Price amount: numeric, `> 0` (native `min="0.01"` + `required`).
- Price unit: required, defaults to `day` so it's never actually empty.
- Location: non-empty after trim.
- Photos: validated per-file as described in §4; not required to submit.

#### Submit behavior

- Button label: "Publish listing" (not "Save" — reinforces that there's no draft state, per the §1 decision).
- On click: disable button, label changes to "Publishing…". Server action creates the `listings` row (`owner_id` from the session, `status = 'published'`), then uploads any staged photos and inserts `listing_images` rows.
- On success: redirect to the new listing's detail page `/listings/[id]` (the natural "here's what you just made" confirmation — no separate success banner needed).

#### Error states

- Single error message area above the submit button (matches M2's pattern), e.g. "Could not publish your listing. Please try again."
- If image upload fails after the listing row was already created, do not roll back the listing — show a specific inline note: "Listing published, but one or more photos failed to upload. You can add photos from the edit page." and still redirect to the listing (better than losing the whole submission over a photo hiccup).

#### Empty/loading states

- Empty state: N/A (this is a blank form on load); all fields start empty/default except price unit (`day`).
- Loading state: none needed pre-submit (no async data fetch on this page — it's a bare form).

### 5.2 Edit listing — `/listings/[id]/edit` (auth required, owner only)

- Same field set, same validation, same form component as §5.1 (reuse one `<ListingForm>` component parameterized by `mode: "create" | "edit"` and optional initial values — mirrors how M2 kept signup/login/profile visually consistent without a component library).
- On page load (server component): fetch the listing by `id`. If it doesn't exist → render a simple "Listing not found" message (see 5.4's not-found pattern). If it exists but `owner_id !== current user.id` → redirect to `/listings/[id]` (the public view) rather than showing an edit form or a scary "forbidden" page — treat it the same as if they'd navigated to view it.
- Existing photos are pre-loaded into the preview grid (fetched from `listing_images` ordered by `position`), each removable exactly like newly-added ones (§4).
- Submit button label: "Save changes" (loading: "Saving…") — distinct from create's "Publish listing" since it's an edit, not a first-time publish.
- On success: redirect to `/listings/[id]` (same "show them the result" pattern as create).
- On error: same generic inline error pattern as create.
- Delete: a separate "Delete listing" button/link (secondary/destructive styling, e.g. red text button) below the form, **not** part of the save form. Clicking it shows a native `confirm()`-style browser confirmation ("Delete this listing? This cannot be undone.") — no custom modal component needed for MVP. On confirm: server action deletes the `listings` row (cascades to `listing_images` rows and, via a cleanup step in the action, the Storage files under that listing's folder), then redirects to `/listings/mine`.

### 5.3 My listings — `/listings/mine` (auth required)

- Page title: "My listings".
- Fetches all `listings` where `owner_id = current user.id`, ordered by `created_at desc`. (Since draft/published isn't a real state per §1, no status filter/tabs here — just one flat list.)
- Each row/card shows: cover image thumbnail (or a plain gray placeholder box with a generic tool icon/initial if no photos), title, category, formatted price (e.g. "$25/day"), location, and two actions: "Edit" (→ `/listings/[id]/edit`) and "Delete" (same confirm-then-delete behavior as §5.2's delete, available inline here too so owners don't have to enter edit mode just to delete).
- Also includes a persistent "+ New listing" button at the top of the page (→ `/listings/new`), visible even when the list is non-empty.

#### Empty state

- No listings yet: replace the list with a centered message "You haven't listed any tools yet." plus a prominent "+ New listing" button (same target as the header button — this is the primary CTA when the list is empty).

#### Loading state

- Server-rendered (like `/profile`), so no client loading spinner needed for the initial fetch.

### 5.4 Public listing index — `/listings` (public)

- Page title: "Browse listings" (or similar; exact wordmark/heading text is a copy detail engineers can finalize).
- Fetches `listings` where `status = 'published'` (always true per §1, but the filter is still written so it's a no-op-safe query, not a behavior engineers need to remember to add later), ordered by `created_at desc`.
- Card grid (responsive: 1 column mobile, 2–3 columns tablet/desktop), each card links to `/listings/[id]` and shows: cover image (or placeholder), title, formatted price, location. Category is optional on the card (nice-to-have, not required).
- No search box, no category filter dropdown, no sort control — explicitly deferred to M4. No pagination is required for MVP with a small catalog; if trivial to add, a simple "Load more" button or a hard cap (e.g. most recent 60) is acceptable, but building full pagination UI is not required.

#### Empty state

- No listings exist platform-wide yet: centered message "No listings yet. Be the first to list a tool!" with a link — if the visitor is logged in, link to `/listings/new`; if logged out, link to `/signup` (so they can create an account first, consistent with auth-required creation).

### 5.5 Public listing detail — `/listings/[id]` (public)

- Layout: image area at top (cover image large, with the remaining photos as a small thumbnail row/strip beneath it — no lightbox/carousel component required for MVP, just plain `<img>` tags; clicking a thumbnail can optionally swap the large image via simple client state, but even that's optional polish) — if zero photos, show a placeholder box instead.
- Below images: title (large heading), price (e.g. "$25 / day", prominent), category, location.
- Description rendered as plain wrapped text (preserve line breaks, no rich text/markdown needed since the input was a plain `<textarea>`).
- Owner section: fetch the owner's row from **`public_profiles`** (not `profiles` — this is a public page, must not expose phone), show `full_name` (or "A tool owner on [site name]" if null) and `city` if present. No avatar-photo requirement, but render `avatar_url` if present using the same fail-silently `onError` pattern as the profile page.
- **No contact/message/"Request to rent" button, no phone number, no chat** — explicitly deferred to M5. If it's helpful to show *something* actionable without building the real flow, a simple non-interactive note like "Contact details coming soon" is acceptable but not required; do not stub a fake button that goes nowhere.
- If the current visitor is the listing's owner (logged in, `owner_id === user.id`), show an extra "Edit listing" link near the title, linking to `/listings/[id]/edit` — small convenience, not a separate screen.

#### Not-found state

- If `id` doesn't match any row: render a simple centered "Listing not found" message with a link back to `/listings`. Use a real Next.js `not-found.tsx` for this route segment (returns proper 404) rather than a client-side conditional render, consistent with treating this as a real public page.

#### Loading state

- Server-rendered fetch, no client spinner needed.

## 6. Route protection

**Public** (no auth required):
- `/listings`
- `/listings/[id]`

**Protected** (auth required):
- `/listings/new`
- `/listings/[id]/edit` (additionally owner-only — see §5.2's redirect-to-detail behavior for non-owners)
- `/listings/mine`

### Enforcement

- Same pattern as M2 §5: server-side check at the top of each protected route's server component — read the session via the Supabase server client; if no user, `redirect('/login?redirectTo=/listings/new')` (etc., using the actual requested path).
- `/listings/[id]/edit` additionally needs the ownership check described in §5.2, performed after the auth check, also server-side.
- Do not rely on RLS alone to "hide" unauthorized edits from the UI — RLS on the `listings` table (owner-only `update`/`delete` policies, mirroring the `profiles` pattern) is the actual security boundary and must exist regardless, but the page-level redirect is what keeps the UX from ever showing a form the request would just fail on.

## 7. Non-goals (explicit)

- **Search / filtering / sorting** (category filter, price range, keyword search, location radius) — M4.
- **Booking / contact-owner flow** (message the owner, request to rent, availability calendar, phone reveal) — M5, along with online payment.
- **Reviews / ratings** on listings or owners — M6.
- **Listing moderation / admin tooling** (flagging, admin approval queue, takedowns) — not scheduled; out of scope for the MVP horizon described in the brief.
- **Draft vs. published workflow** — considered and explicitly deferred (see §1); `status` column exists for future use but no UI exposes it in M3.
- **Image reordering / dedicated cover-photo picker** — deferred; first-uploaded-image-is-cover is the M3 rule (see §4).
- **Mobile (Expo) screens** — this spec covers `apps/web` only; a mobile-equivalent spec should be written separately when that milestone starts, reusing the same color palette/spacing scale and field/validation rules documented here.

## 8. Copy reference (exact button/link labels)

- Create submit: "Publish listing" (loading: "Publishing…")
- Edit submit: "Save changes" (loading: "Saving…")
- Delete: "Delete listing" (confirm dialog: "Delete this listing? This cannot be undone.")
- My listings header CTA: "+ New listing"
- My listings empty state CTA: "+ New listing"
- Public index empty state (logged in): "Be the first to list a tool!" → `/listings/new`
- Public index empty state (logged out): "Be the first to list a tool!" → `/signup`
- Detail page owner convenience link: "Edit listing"
- Not-found message: "Listing not found"

## 9. Styling notes

- Same visual language as M2: plain Tailwind utility classes, no component library.
- Forms: single-column, centered card, `max-w-md` (matches profile's width — listing forms have a similar number of fields).
- Card grids (`/listings`, `/listings/mine`): reuse the same border/rounded-corner/spacing scale already established (rounded corners, light border or subtle shadow, consistent padding) rather than inventing a new card style.
- Price formatting: always render as `$X.XX / unit` (e.g. `$25.00 / day`) — consistent format across cards and detail page.
- Error text: small, red (`text-red-600`); success text: small, green (`text-green-600`) — same as M2.
- Image placeholders (no photo): a plain light-gray box with a centered generic icon or the listing's first letter — no stock photo, no external placeholder-image service dependency.

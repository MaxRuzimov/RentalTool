# M2 — Auth UX/UI Spec (Signup, Login, Logout, Profile)

Status: ready for implementation
Scope: `apps/web` (Next.js 16 App Router + Tailwind v4), Supabase Auth (email/password)
Non-goals for M2: social login, SMS auth, password-reset flow (noted as fast-follow), avatar file upload, listing pages, mobile.

## 0. Assumptions engineers should verify before starting

- `apps/web/package.json` already lists `@supabase/ssr` and `@supabase/supabase-js` as dependencies. Confirm the browser/server Supabase clients (cookie-based session) are actually wired up before building these screens — if not, that setup is a prerequisite, not part of this spec.
- Local/dev Supabase config (`supabase/config.toml`) has `auth.email.enable_confirmations = false`, so `signUp()` returns an active session immediately — no "check your email" step in M2. If this flips to `true` in a later environment, the signup success state below needs a "confirm your email" variant — out of scope for now but flag it in code comments.
- `profiles` row is auto-created by a DB trigger on signup, seeded from `full_name`/`avatar_url` passed in `signUp()`'s `options.data`. Nothing else needs to write the initial profile row.
- No listing/marketplace pages exist yet in M2, so route protection only has two states: public and auth-required (profile).

## 1. Global: Site header / nav

Applies to every page (implement in `apps/web/src/app/layout.tsx` or a shared `<Header>` component rendered from it).

- Left: site/brand name (plain text or simple wordmark), links to `/`.
- Right, **logged out**: two text/button links — "Log in" (`/login`) and "Sign up" (`/signup`), sign up styled as the primary (filled) button, log in as secondary (plain/link style).
- Right, **logged in**: user's `full_name` (or "Account" if `full_name` is null/empty) as a link to `/profile`, plus a "Log out" button next to it. No dropdown menu needed for M2 — two plain elements side by side is enough.
- Auth state must be read server-side (from the Supabase server client / cookies) so the header renders correctly on first paint — no flash of logged-out state.
- Loading/indeterminate state: none needed if server-rendered; if any client-side re-check is added, render nothing (skip both link groups) rather than a spinner.

### Logout behavior

- "Log out" is a simple button (can be a form with a server action, or a client `onClick` calling `supabase.auth.signOut()`).
- On click: immediately sign out, then redirect to `/` (home).
- No confirmation dialog.
- No explicit toast required; the header flipping to the logged-out state is sufficient feedback.

## 2. Signup page — `/signup`

### Fields

| Field | Input type | Required | Notes |
|---|---|---|---|
| Full name | `text`, name=`full_name` | yes | Passed as `user_metadata.full_name` in `signUp()`, trigger seeds `profiles.full_name` |
| Email | `email`, name=`email` | yes | |
| Password | `password`, name=`password` | yes | |
| Confirm password | `password`, name=`confirm_password` | yes | Client-side match check only, not sent to Supabase |

Avatar URL, phone, and city are **not** on the signup form — those are edited later on the profile page, keeping signup minimal.

### Validation (client-side, before calling Supabase)

- Full name: non-empty, trimmed (min 1 char).
- Email: must match a basic email pattern (use native `type="email"` + `required`; no need for custom regex).
- Password: minimum 6 characters (Supabase's default minimum). Show this as helper text under the field before submit, e.g. "At least 6 characters."
- Confirm password: must equal password. Show inline error "Passwords do not match" if not, on blur or submit attempt.
- Block submit (disable button or show inline errors) if any of the above fail. Use plain HTML5 `required`/`minLength` attributes where possible, plus one JS check for password match.

### Submit behavior

- On submit: call `supabase.auth.signUp({ email, password, options: { data: { full_name } } })`.
- Disable the submit button and show a "Signing up…" label while the request is in flight.

### Error states (server-side, after calling Supabase)

Show a single error message area above or below the form (not per-field, since Supabase errors are coarse). Map known cases:

- Email already registered → "An account with this email already exists. Try logging in instead." (include a link to `/login`).
- Weak/short password rejected by Supabase → "Password must be at least 6 characters."
- Any other error → generic "Something went wrong. Please try again." (log the actual error to console for debugging).

### Success behavior

- Since email confirmation is disabled, `signUp()` returns an active session immediately.
- On success: redirect to `/profile` (so the user can see/complete their profile — phone and city are still empty at this point).
- No separate "verify your email" screen for M2.

### Footer link

- Below the form: "Already have an account? Log in" → `/login`.

## 3. Login page — `/login`

### Fields

| Field | Input type | Required |
|---|---|---|
| Email | `email`, name=`email` | yes |
| Password | `password`, name=`password` | yes |

### Submit behavior

- Call `supabase.auth.signInWithPassword({ email, password })`.
- Disable submit button and show "Logging in…" while in flight.

### Error states

- Supabase returns a generic "Invalid login credentials" for both wrong password and unknown email (by design, to avoid leaking which emails are registered) — **do not** try to distinguish these. Show one generic message: "Invalid email or password." above/below the form.
- Any other/network error → generic "Something went wrong. Please try again."

### Success behavior

- Redirect to `/` (home) by default. If the user was redirected to `/login` from a protected route (e.g. `/profile?redirectTo=/profile` — see §5), redirect back to that `redirectTo` path instead.

### Forgot password

- Add a "Forgot password?" text link near the password field, but make it a **disabled-looking stub for M2**: either omit the link entirely, or render it as plain non-interactive text with a tooltip/note "Coming soon". Do not build the reset-password flow (Supabase `resetPasswordForEmail` + reset-confirmation page) in M2 — file it as an explicit fast-follow for M3+.

### Footer link

- Below the form: "Don't have an account? Sign up" → `/signup`.

## 4. Profile page — `/profile` (auth required)

Single page, no sub-routes. Use one form that toggles between **view mode** and **edit mode** (simplest: always render an editable form pre-filled with current values, with a "Save" button — a separate strict view/edit toggle is optional polish, not required for M2). Recommended minimal approach: **inline editable form**, no separate view mode, to cut scope.

### Data source

- On page load (server component), fetch the current user's row from `profiles` (full row, allowed by RLS since `auth.uid() = id`) — not `public_profiles` (which excludes phone).
- If for any reason no session exists, this route is protected (see §5) so this shouldn't be reachable — but the fetch should handle a null user gracefully by redirecting rather than crashing.

### Fields

| Field | Input type | Required | Notes |
|---|---|---|---|
| Full name | `text`, name=`full_name` | no (nullable in DB) but recommend requiring non-empty in the UI | |
| Avatar URL | `url`, name=`avatar_url` | no | Plain text input for a URL for MVP. No file upload (that's M3). Optionally render a small `<img>` preview if the field is non-empty and looks like a URL; on broken image just let it fail silently (`onError` → hide the `<img>`), don't block save. |
| Phone | `tel`, name=`phone` | no | Only ever shown/edited here (the owner's own page) — not shown on any public profile view. Add a short helper note: "Only visible to you for now." |
| City | `text`, name=`city` | no | Free text for MVP (no dropdown/autocomplete — GTA city list is a later nicety). |

Email is **not editable** here for M2 (email change requires Supabase's separate confirmation flow — out of scope). Display it as read-only text at the top of the page for context, e.g. "Signed in as jane@example.com".

### Validation

- Full name: if provided, non-empty after trim.
- Avatar URL: if provided, must be `type="url"` — rely on native validation; no need for stricter checks.
- Phone: no strict format validation for MVP (free text, native `type="tel"` is enough); optionally cap length.
- City: no validation beyond non-empty if the user chooses to fill it.
- All fields are individually optional to save except full_name should be nudged (not hard-blocked) to be filled.

### Save behavior

- Single "Save changes" button submits all fields in one `update` call to `profiles` (`.update({...}).eq('id', user.id)`), which the RLS "Users can update their own profile" policy allows.
- Disable the button and show "Saving…" while in flight.
- On success: show an inline success message ("Profile updated.") that disappears after a few seconds, or simply re-render the form with the saved values — no full-page reload needed if using a client-side update; if using a server action, a redirect-back-to-self with a `?saved=1` query flag rendering a small confirmation banner is acceptable.
- On error: generic inline error "Could not save changes. Please try again." above the form.

### Empty state

- Not really applicable (form always renders); if `full_name`/`avatar_url`/`phone`/`city` are null, just render the inputs empty with placeholder text, e.g. placeholder "Your full name", "https://…", "(647) 555-0100", "e.g. Toronto".

## 5. Route protection

Two states only for M2:

**Public** (no auth required):
- `/` (home)
- `/login`
- `/signup`

**Protected** (auth required):
- `/profile`

### Enforcement

- Implement as a server-side check at the top of the `/profile` route (in the page/layout server component): read the session via the Supabase server client; if no user, `redirect('/login?redirectTo=/profile')`.
- Do not rely on client-side-only checks (e.g. a `useEffect` redirect) as the sole guard — it would flash protected content before redirecting.
- Additionally (nice-to-have, not required for M2): if a logged-in user visits `/login` or `/signup`, redirect them to `/profile` or `/` instead of showing the form again. Optional polish, skip if it adds friction.

## 6. Copy reference (exact button/link labels)

- Signup submit: "Sign up" (loading: "Signing up…")
- Login submit: "Log in" (loading: "Logging in…")
- Profile save: "Save changes" (loading: "Saving…")
- Header logged-out: "Log in", "Sign up"
- Header logged-in: user's name (or "Account"), "Log out"
- Signup footer link: "Already have an account? Log in"
- Login footer link: "Don't have an account? Sign up"
- Forgot password stub: "Forgot password? (coming soon)" — non-clickable or omitted entirely

## 7. Styling notes

- Plain Tailwind utility classes, no component library (matches repo's existing minimal Tailwind v4 setup in `apps/web`).
- Forms: single-column, centered card, max-width ~`max-w-sm` for login/signup, `max-w-md` for profile (more fields).
- Reuse the existing rounded-button/link visual language already present in `apps/web/src/app/page.tsx` (rounded-full primary button, bordered secondary button) rather than introducing a new style system — swap copy/hrefs only.
- Error text: small, red (`text-red-600` or similar), placed directly above the submit button.
- Success text: small, green (`text-green-600` or similar).

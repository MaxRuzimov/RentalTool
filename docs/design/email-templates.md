# Auth email templates — Supabase Dashboard hand-off

Status: ready to paste into the dashboard
Scope: Supabase Auth's built-in transactional emails (Authentication → Email Templates in the
Supabase Dashboard). These are configured in the hosted project's dashboard, not in this repo's
`supabase/config.toml` (that file only governs local dev) and not in application code — nothing
here can be pushed by an agent; a human with dashboard access (Max) has to paste this in.

## 0. Why this exists, and what it pairs with

Found while investigating Max's report that the signup confirmation link didn't work: Supabase's
*default* "Confirm signup" template links `{{ .ConfirmationURL }}` straight to the GoTrue
server's own `/auth/v1/verify` endpoint, which redirects the browser with auth tokens in the URL
**hash fragment** after verifying. This app's `@supabase/ssr`-based session (httpOnly cookies,
read server-side — see `apps/web/src/lib/supabase/server.ts`) has no client-side code that reads
a hash fragment, so that default flow leaves a "confirmed" user landing on some page **not
actually logged in** — indistinguishable, from the user's side, from "the link doesn't work."

The fix has two halves, both required together:

1. **Code** (already built, on branch `fix/email-confirmation-and-notifications`):
   `apps/web/src/app/auth/confirm/route.ts` — a route handler that reads `token_hash`/`type`
   from the URL, calls `supabase.auth.verifyOtp()` server-side (which *does* write the session as
   cookies), and redirects into the app. This is Supabase's own documented pattern for SSR
   frameworks using `@supabase/ssr`.
2. **This template** — the email's link must point at `/auth/confirm` (with `token_hash`/`type`
   as plain query params) instead of Supabase's default `{{ .ConfirmationURL }}`, or the code in
   (1) never runs.

Also required, separately (not part of this doc — see the M10 deploy-readiness thread): Supabase
Dashboard → Authentication → URL Configuration → **Site URL** must be
`https://rental-tool-web.vercel.app`, and **Redirect URLs** must include
`https://rental-tool-web.vercel.app/**` — the template below uses `{{ .SiteURL }}`, so if that
setting is still `http://localhost:3000` the link will point at localhost regardless of how good
the template is. Confirm that's been updated before testing this.

## 1. What to change in the Dashboard

**Authentication → Email Templates → Confirm signup**:

- **Subject**: `Confirm your RentalTool account` (or keep the default "Confirm Your Signup" —
  cosmetic, your call)
- **Message body**: replace the entire body with the HTML in §2 below.

That's the only template this app's code can currently trigger — see §3 for why the other four
built-in templates (Invite, Magic Link, Change Email Address, Reset Password) are intentionally
left alone for now.

## 2. Confirm signup — HTML source

Paste this exactly as the template body. It's plain inline-styled HTML (table-based layout, no
external stylesheet, no webfont `@import`) — the standard approach for email, since most email
clients strip `<style>` blocks and don't reliably load external CSS or Google Fonts. Colors are
hardcoded to this app's **light-mode** design tokens (`docs/design/design-system.md` §1.2) since
email clients don't support `prefers-color-scheme`-driven CSS custom properties reliably enough
to build a real dark-mode variant — a single, always-light template is the standard practice for
transactional email and is not a regression from anything the app itself does.

```html
<div style="background-color:#fafafa; padding:40px 16px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; margin:0 auto; background-color:#ffffff; border:1px solid rgba(0,0,0,0.08); border-radius:16px; overflow:hidden;">
    <tr>
      <td style="padding:32px 32px 24px 32px;">
        <p style="margin:0 0 24px 0; font-size:18px; font-weight:600; color:#1e3a5f;">
          RentalTool
        </p>

        <h1 style="margin:0 0 12px 0; font-size:20px; font-weight:600; color:#18181b;">
          Confirm your account
        </h1>

        <p style="margin:0 0 24px 0; font-size:14px; line-height:1.6; color:#3f3f46;">
          Thanks for signing up for RentalTool. Click the button below to confirm your email
          address and finish setting up your account.
        </p>

        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
          <tr>
            <td style="border-radius:9999px; background-color:#c2410c;">
              <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=email&amp;next=/profile?confirmed=1"
                 style="display:inline-block; padding:12px 28px; font-size:14px; font-weight:500; color:#ffffff; text-decoration:none; border-radius:9999px;">
                Confirm your email
              </a>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 8px 0; font-size:12px; line-height:1.6; color:#71717a;">
          If the button doesn't work, copy and paste this link into your browser:
        </p>
        <p style="margin:0 0 24px 0; font-size:12px; line-height:1.6; word-break:break-all; color:#1e3a5f;">
          {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=email&amp;next=/profile?confirmed=1
        </p>

        <p style="margin:0; font-size:12px; line-height:1.6; color:#a1a1aa;">
          If you didn't create a RentalTool account, you can safely ignore this email.
        </p>
      </td>
    </tr>
  </table>
</div>
```

Preview of what the recipient sees: a white card on a light-gray background, the "RentalTool"
wordmark in navy (`#1e3a5f`, matching the app header — design-system.md §1.2's `--accent`), a
short explanation, an orange pill button (`#c2410c`, matching `--primary`) labeled "Confirm your
email," a plain-text fallback link, and a one-line disclaimer. No logo image is embedded (an
image would need to be hosted somewhere and could be blocked by email clients by default anyway)
— the wordmark is styled text, consistent with how `Header.tsx` renders it in-app (text, not an
image).

## 3. Other built-in templates — intentionally not branded yet

Supabase's dashboard has five templates total: **Confirm signup** (branded above), **Invite
user**, **Magic Link**, **Change Email Address**, and **Reset Password**. Only "Confirm signup"
is branded here because it's the only one any code path in this app can currently trigger:

- **Invite user** — this app has no admin/invite-a-user flow (users self-serve via `/signup`).
  Unreachable.
- **Magic Link** — this app only supports password-based login (`supabase.auth
  .signInWithPassword`, see `LoginForm.tsx`); no magic-link/OTP-login UI exists. Unreachable.
- **Change Email Address** — `ProfileForm.tsx` doesn't expose an email field at all (only
  `full_name`/`avatar_url`/`phone`/`city`); users cannot currently change their account email
  in-app. Unreachable.
- **Reset Password** — `LoginForm.tsx`'s "Forgot password?" is a deliberately inert, non-clickable
  stub (`docs/design/m2-auth-spec.md` §3's explicit non-goal, never revisited since). Unreachable
  today, but the **most likely of the four to actually get built** in a future milestone — flagged
  here as a fast-follow: whoever builds password reset should pair it with a branded template
  using the same visual language as §2 (same wordmark treatment, same `--primary` button, same
  card shell) and the same `/auth/confirm`-style route pattern (Reset Password's template variable
  is `type=recovery` instead of `type=email`, landing on a new-password form instead of `/profile`
  — that route doesn't exist yet either, since the feature doesn't exist yet).

Branding all five now, before four of them are reachable by any button or link in the app, would
mean shipping templates nobody ever sees and that can't be verified working — same "build what's
needed now" reasoning used throughout this project's other milestones (e.g. M6 deferring
owner-reviews-renter, M8 deferring listing creation on mobile).

## 4. Verification, once Max has updated Site URL + pasted this template

1. Sign up a **disposable** test account (e.g. a real inbox you control, or a `+test` alias) —
   this must go through the actual production Supabase project and a real email provider, since
   local dev's Mailpit/Inbucket never reaches a real inbox and can't test link deliverability.
2. Open the received email, confirm: RentalTool wordmark/navy, orange "Confirm your email"
   button, no leftover Supabase default styling/copy.
3. Click the button. Expected: lands on `/profile` with the green "Email confirmed — you're all
   set." banner (from `ProfileForm.tsx`'s new `justConfirmed` prop), and the header shows the
   logged-in nav (My listings / Bookings / account name / Log out) — i.e., actually logged in, not
   just "the link didn't error."
4. Click the plain-text fallback link instead (from a fresh unconfirmed account) to confirm that
   path works too, not just the styled button.
5. Clean up the disposable test account afterward via the Supabase Admin API
   (`DELETE /auth/v1/admin/users/{id}` with the project's service-role key) so it doesn't linger
   in the production user table.

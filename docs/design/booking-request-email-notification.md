# Booking-request email notification — scope (not yet implemented)

Status: scoped, ready to implement once a provider/account exists — **do not build the send
integration yet**, per Max's explicit hold on this piece (he needs to pick a transactional email
provider and create the account/API key first; this is a new-external-service decision, same
category as M10's Vercel account and M11's store developer accounts, not something to provision
unilaterally).

This is Part (a) of Max's notification request; Part (b) (the in-app pending-request badge on the
header "Bookings" link) is already built and merged — see `apps/web/src/components/Header.tsx`.

## 1. What triggers it

A new row inserted into `public.bookings` with `status = 'pending'` — i.e. every successful call
to `createBookingRequest()` (`apps/web/src/app/bookings/actions.ts`). Not `approveBooking`/
`declineBooking`/`cancelBooking` — those are status *transitions* on an existing row a party
already knows about (the renter/owner initiated them), not a new, unprompted event the other
party needs to be told about. Only "a stranger just asked to rent your tool" is the case where an
owner has no other way to find out except by remembering to check the app.

## 2. Recipient — the real problem this needs to solve

The email goes to the **listing owner**, at the email address on their `auth.users` row. This is
the one genuinely tricky part of this feature, worth flagging clearly: **no email address is
readable from `apps/web`'s normal request path today.** `public.profiles`/`public_profiles` never
stored email (only `auth.users` does, which Postgres RLS on `auth.users` doesn't expose to a
normal `authenticated`-role query, by design — Supabase's own convention), and this app's web
server has never held a service-role key (confirmed during M10's deploy-readiness audit:
`SUPABASE_SERVICE_ROLE_KEY` exists in `.env.example` but is used nowhere in `apps/web/src`, and
Vercel's project env vars deliberately don't include it — see `docs/design/design-system.md`'s
sibling M10 prep notes / the root `.env.example` comment "Server-only, never expose to the
client"). Getting the owner's email therefore needs *some* privileged path — two reasonable ones:

### Option A — Supabase Database Webhook → Edge Function (recommended)

A `bookings` `AFTER INSERT` webhook (Supabase Dashboard → Database → Webhooks, or a migration
using `pg_net`/`supabase_functions.http_request`) fires on every new booking row, calling a
Supabase Edge Function. The Edge Function runs inside Supabase's own infrastructure, where a
service-role key is normal/expected to use (it never leaves that environment), looks up the
owner's `auth.users.email` via `auth.admin.getUserById()`, and calls the email provider's API.

**Why this is the better default over a Next.js/Vercel-side integration:** it keeps the "who has
the service-role key" boundary exactly where it already is (nowhere in `apps/web`) rather than
introducing Vercel's first-ever server-only secret into this app's env — a real change to this
app's security posture that M10 specifically confirmed wasn't needed. It also decouples sending
the email from the booking request's own response time (the renter's `createBookingRequest` call
doesn't wait on an email API round-trip to complete) and gets a free retry/observability surface
(Supabase's own webhook delivery logs) instead of hand-rolling that in a Next.js route.

### Option B — inline in `createBookingRequest`, from `apps/web`

Add `SUPABASE_SERVICE_ROLE_KEY` (already documented, currently unused) to Vercel's env, create a
service-role Supabase client inside the server action, look up the owner's email the same way,
call the email provider's API directly, `await` (or fire-and-forget) it as part of the action.
Simpler to reason about (one code path, no separate Supabase-side config), but it's the version
that adds a new secret to the deployed web app for the first time and couples email delivery to
the request path — a slow/down email provider becomes the booking-request flow's problem too,
unless carefully fire-and-forgotten (which then has no error visibility at all from within
`apps/web`'s own logs).

**Recommendation: Option A.** Flagging Option B as the fallback if Edge Functions turn out to add
more friction than expected once someone is actually implementing this — not a strong objection
to B, just a documented default so the choice doesn't need to be re-litigated later.

## 3. Email content

Same visual language as the "Confirm signup" template (`docs/design/email-templates.md` §2) —
RentalTool wordmark in navy, orange primary button, plain-text fallback link, one-line footer.
Content specific to this email:

- **Subject**: `New booking request for "{listing title}"`
- **Body**: "{renter's full name} wants to rent your **{listing title}** for {start_date} –
  {end_date}." (dates formatted the same way the app already does — `formatDateRange` in
  `apps/web/src/lib/bookings/pricing.ts` — for consistency, reuse it if the send path is
  server-side JS/TS; if it ends up as a Deno Edge Function, port the same formatting logic rather
  than reinventing it, same "port, don't reimplement" convention M8 used for pricing math).
- **Button**: "View request" → `https://rental-tool-web.vercel.app/bookings/owner-requests`
  (the app's existing owner-requests page — no new page needed for this).
- **Footer**: "You're receiving this because someone requested to rent a tool you listed on
  RentalTool."

No per-user notification preferences/opt-out in scope for this pass (this app has no settings
page at all yet) — every booking request an owner receives sends exactly one email, matching the
in-app badge's own "always show accurate pending count" behavior with no configurability.

## 4. What's needed before implementation can start

1. **Max picks a transactional email provider and creates the account** — Resend was suggested
   (free tier ~3,000 emails/month, which is generous for this app's likely volume for a long
   time) but this is Max's call, not decided here. Whatever's chosen needs an API key.
2. **A verified sending domain** (or at minimum a verified sender address) with the chosen
   provider — most transactional email providers require domain verification (SPF/DKIM records)
   before they'll reliably deliver, especially to avoid landing in spam. If RentalTool doesn't
   have its own email-capable domain yet (the web app itself is on the free `*.vercel.app`
   subdomain per M10's scope), this may need its own small decision (a cheap domain purchase, or
   sending from the provider's own shared/test domain initially with the understanding that
   deliverability may be worse) — flagging as a real sub-decision, not assuming "buy a domain" is
   automatically the right call for an MVP.
3. Once both exist: implement Option A (or B, if reconsidered) as its own small milestone/task —
   the trigger, recipient-lookup, and content are all already specified above, so that work should
   be quick once the account/domain exist.

## 5. Non-goals (explicit)

- No notification preferences/settings page.
- No SMS/push notifications — email only, per Max's stated ask.
- No notification for any event other than a new pending request (no "your request was approved"
  email, etc.) — not asked for, and the in-app status visibility already covers those cases the
  same way it has since M5.
- No retry/dead-letter handling beyond whatever the chosen implementation path (Supabase webhook
  delivery logs, or a try/catch in the server action) provides by default — not over-building
  reliability infrastructure for a single transactional email on an MVP.

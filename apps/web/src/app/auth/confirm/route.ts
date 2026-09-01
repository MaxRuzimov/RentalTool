import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Handles the link Supabase sends in confirmation/magic-link/recovery
 * emails. Supabase's *default* email templates link `{{ .ConfirmationURL }}`
 * directly to the GoTrue server's own `/auth/v1/verify` endpoint, which
 * completes the OTP verification server-side and then redirects the browser
 * — but only ever with tokens in the URL *hash fragment* (the legacy
 * implicit-flow shape). This app's `@supabase/ssr`-based client stores its
 * session as httpOnly cookies for Server Components/Actions to read (see
 * `lib/supabase/server.ts`), and nothing in this app reads a hash fragment
 * client-side, so an implicit-flow redirect would land a user on a page
 * that LOOKS confirmed (GoTrue did mark the email verified) but leaves them
 * NOT actually logged in — the classic "confirmation link doesn't do
 * anything" symptom.
 *
 * The fix (Supabase's own documented pattern for SSR frameworks): point the
 * email template at THIS route instead, passing `token_hash`/`type` as
 * plain query params, and call `verifyOtp()` here — `@supabase/ssr`'s
 * server client writes the resulting session as cookies via `createClient()`
 * (see server.ts's `setAll`), which is what actually makes the user
 * appear logged in on the page they land on next.
 *
 * Email template's link must be:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/profile?confirmed=1
 * (see docs/design/email-templates.md for the full template this pairs with).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"));

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      redirect(next);
    }
  }

  // Missing/invalid params, or verifyOtp failed (expired/already-used link,
  // etc.) — send them to login with an explanatory banner rather than a
  // dead-end error page; they can also just try logging in directly if
  // they'd already confirmed via an earlier click on the same link.
  redirect("/login?confirmError=1");
}

// Same "only a same-origin relative path" guard as LoginForm's
// `safeRedirectTarget` (open-redirect hardening) — `next` comes from an
// email template value, not user input, but treating it with the same
// caution costs nothing and keeps one consistent rule for "anywhere a
// redirect target arrives as a query param" in this app.
function safeNext(next: string | null): string {
  if (!next) return "/profile";
  if (!/^\/(?!\/|\\)[^\s\\]*$/.test(next)) return "/profile";
  return next;
}

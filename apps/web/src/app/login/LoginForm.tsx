"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Only redirect to a same-origin relative path. `redirectTo` comes from a
 * URL query param, so treat it as untrusted input rather than following it
 * blindly. Beyond blocking `//evil.com` and `https://evil.com`, this also
 * rejects a leading backslash (e.g. `/\evil.com`): WHATWG URL parsing (which
 * Next's router relies on) treats `\` as equivalent to `/` for special
 * schemes, so `new URL("/\\evil.com", "https://yourapp.com")` resolves to
 * `https://evil.com/` — an open redirect if left unblocked. Any backslash
 * anywhere in the value is rejected, not just a leading one, since encoded
 * or embedded variants (`/%5Cevil.com`) decode to the same trick.
 */
function safeRedirectTarget(redirectTo: string | undefined): string {
  if (!redirectTo) return "/";
  if (!/^\/(?!\/|\\)[^\s\\]*$/.test(redirectTo)) return "/";
  return redirectTo;
}

export default function LoginForm({
  redirectTo,
  confirmError,
}: {
  redirectTo?: string;
  confirmError?: boolean;
}) {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    // M14 fix: `signInWithPassword` reaches Supabase directly over the
    // network from the browser — a DNS failure/offline connection can throw
    // rather than resolve with `{ error }`. Without this try/catch that was
    // an unhandled promise rejection: `submitting` never got reset, so the
    // button stayed stuck "Logging in…" forever with no feedback.
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        console.error(signInError);
        // Supabase intentionally returns the same "Invalid login credentials"
        // error for both a wrong password and an unknown email, so this does
        // not (and should not) try to distinguish the two cases (spec §3).
        if (signInError.message.toLowerCase().includes("invalid login credentials")) {
          setError("Invalid email or password.");
        } else {
          setError("Something went wrong. Please try again.");
        }
        return;
      }

      router.push(safeRedirectTarget(redirectTo));
      router.refresh();
    } catch (err) {
      console.error("LoginForm submit failed", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-surface-muted px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Log in</h1>

        {confirmError && (
          <p className="mt-6 rounded-lg bg-danger-bg px-4 py-3 text-sm text-danger-foreground">
            That confirmation link is invalid or has expired. If you already confirmed your
            account, just log in below — otherwise sign up again to get a new link.
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm font-medium text-foreground">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-zinc-400 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 dark:placeholder:text-zinc-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="text-sm font-medium text-foreground">
                Password
              </label>
              {/* Password reset is out of scope for M2 (fast-follow for M3+) —
                  rendered as inert text, not a working link. See spec §3. */}
              <span
                className="text-xs text-zinc-400 dark:text-zinc-500"
                title="Coming soon"
              >
                Forgot password? (coming soon)
              </span>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-zinc-400 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 dark:placeholder:text-zinc-500"
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 flex h-11 w-full items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover active:bg-primary-active disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {submitting ? "Logging in…" : "Log in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="font-medium text-accent underline-offset-2 hover:underline hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}

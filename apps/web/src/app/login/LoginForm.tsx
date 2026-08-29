"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Only redirect to a same-origin relative path. `redirectTo` comes from a
 * URL query param, so treat it as untrusted input rather than following it
 * blindly (avoids an open-redirect via `//evil.com` or `https://evil.com`).
 */
function safeRedirectTarget(redirectTo: string | undefined): string {
  if (redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//")) {
    return redirectTo;
  }
  return "/";
}

export default function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setSubmitting(false);

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
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16 dark:bg-black">
      <div className="w-full max-w-sm rounded-2xl border border-black/[.08] bg-white p-8 dark:border-white/[.145] dark:bg-[#0a0a0a]">
        <h1 className="text-2xl font-semibold text-foreground">Log in</h1>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4" noValidate>
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
              className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm text-foreground dark:border-white/[.145]"
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
              className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm text-foreground dark:border-white/[.145]"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 flex h-11 w-full items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            {submitting ? "Logging in…" : "Log in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium text-foreground underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}

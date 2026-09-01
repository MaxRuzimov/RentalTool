"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

// No `searchParams` needed here, so this page is a Client Component
// directly (unlike /login, which needs the server-provided `redirectTo`
// query param — see docs/design/m2-auth-spec.md §2 vs §3).
export default function SignupPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ReactNode>(null);
  const [confirmationPending, setConfirmationPending] = useState(false);

  const passwordsMismatch =
    confirmTouched && confirmPassword.length > 0 && confirmPassword !== password;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedFullName = fullName.trim();
    if (!trimmedFullName) {
      setError("Please enter your full name.");
      return;
    }
    if (password !== confirmPassword) {
      setConfirmTouched(true);
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: trimmedFullName } },
    });
    setSubmitting(false);

    if (signUpError) {
      console.error(signUpError);
      const message = signUpError.message.toLowerCase();
      if (message.includes("already registered") || message.includes("already exists")) {
        setError(
          <>
            An account with this email already exists.{" "}
            <Link
              href="/login"
              className="font-medium text-accent underline-offset-2 hover:underline hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
            >
              Try logging in instead.
            </Link>
          </>,
        );
      } else if (message.includes("password")) {
        setError("Password must be at least 6 characters.");
      } else {
        setError("Something went wrong. Please try again.");
      }
      return;
    }

    // Whether signUp() returns an active session depends on the project's
    // email-confirmation setting: locally (auth.email.enable_confirmations
    // = false in supabase/config.toml, see spec §0) it's returned
    // immediately and we can go straight to the profile page. On a hosted
    // project with confirmations enabled (the default there), signUp()
    // succeeds with no error but `data.session` is null until the user
    // clicks the confirmation link — redirecting to /profile in that case
    // would just bounce them to /login with no explanation, so show a
    // "check your email" message instead.
    if (data.session) {
      router.push("/profile");
      router.refresh();
      return;
    }

    setConfirmationPending(true);
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-surface-muted px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Sign up</h1>

        {confirmationPending ? (
          <p className="mt-6 text-sm text-success">
            Account created! Check your email and click the confirmation link to finish setting
            up your account.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="full_name" className="text-sm font-medium text-foreground">
                Full name
              </label>
              <input
                id="full_name"
                name="full_name"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
                className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-zinc-400 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 dark:placeholder:text-zinc-500"
              />
            </div>

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
              <label htmlFor="password" className="text-sm font-medium text-foreground">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-zinc-400 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 dark:placeholder:text-zinc-500"
              />
              <p className="text-xs text-zinc-500 dark:text-zinc-400">At least 6 characters.</p>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="confirm_password" className="text-sm font-medium text-foreground">
                Confirm password
              </label>
              <input
                id="confirm_password"
                name="confirm_password"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onBlur={() => setConfirmTouched(true)}
                className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-zinc-400 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 dark:placeholder:text-zinc-500"
              />
              {passwordsMismatch && (
                <p className="text-xs text-danger">Passwords do not match.</p>
              )}
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 flex h-11 w-full items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover active:bg-primary-active disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {submitting ? "Signing up…" : "Sign up"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-accent underline-offset-2 hover:underline hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
          >
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}

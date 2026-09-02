"use client"; // Error boundaries must be Client Components.

import Link from "next/link";
import { useEffect } from "react";

/**
 * M14 addition: root error boundary. Before this milestone, an uncaught
 * exception anywhere in the App Router's render tree (a Server Component
 * throwing, or — the case this milestone specifically hardens against — a
 * Server Action invoked via `useActionState`/`formAction`, e.g.
 * ProfileForm's `updateProfile`, throwing instead of resolving with an
 * `{ status: "error" }` object) had no `error.tsx` anywhere in this app to
 * catch it, so it fell through to Next's default unstyled crash page with
 * no way back except a manual reload.
 *
 * This wraps `layout.tsx`'s `{children}` (so the header above it keeps
 * rendering — signed-in nav links still work as an escape hatch) and gives
 * a branded, actionable fallback instead: try again in place, or head back
 * to a known-good page.
 */
export default function GlobalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled application error", error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-surface-muted px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        Something went wrong
      </h1>
      <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
        An unexpected error occurred. Please try again — if the problem keeps happening, head
        back to the homepage.
      </p>
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover active:bg-primary-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Try again
        </button>
        <Link
          href="/"
          className="text-sm font-medium text-accent underline-offset-2 hover:underline hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
        >
          Go to homepage
        </Link>
      </div>
    </div>
  );
}

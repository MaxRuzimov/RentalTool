/**
 * M14 addition: shared helper for every client component that wraps a
 * direct `await someServerAction(...)` call in try/catch (see e.g.
 * ListingForm's handleSubmit).
 *
 * `redirect()` (from `next/navigation`, used by several of this app's
 * successful-submit paths — createListing, updateListing, deleteListing,
 * createBookingRequest) works by throwing a special Next.js control-flow
 * error whose `digest` starts with `NEXT_REDIRECT`. A generic catch block
 * added to guard against real failures (a network error reaching the
 * server, an unexpected exception, etc. — see the M14 task) must not treat
 * that control-flow error as a failure: doing so would swallow the redirect
 * and show a false "something went wrong" message on what was actually a
 * successful submit. `next/navigation` doesn't publicly export a check for
 * this in the installed Next version, so this mirrors Next's own
 * (documented, stable-across-versions) `digest` convention rather than
 * reaching into `next/dist/...` internals.
 */
export function isRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

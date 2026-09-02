"use client";

import { useFormStatus } from "react-dom";

/**
 * M14 addition: the header's "Log out" button previously had no in-flight/
 * double-submit guard at all — a plain `<button type="submit">` inside a
 * `<form action={logout}>` with no `useFormStatus` — unlike every other
 * async submit button in the app (see the M14 task's "every async submit
 * button" checklist). Logout itself is low-risk to double-fire (it's
 * idempotent), but there's no reason for it to be the one exception to this
 * app's "disable the button while its action is in flight" convention,
 * which every other form in the app already follows (see e.g. ProfileForm's
 * `SaveButton`, the exact same `useFormStatus` pattern this mirrors).
 */
export default function LogoutButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-9 items-center justify-center rounded-full border border-line px-4 transition-colors hover:border-transparent hover:bg-surface-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {pending ? "Logging out…" : "Log out"}
    </button>
  );
}

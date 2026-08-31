"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { updateProfile, type ProfileFormState } from "./actions";

// Defined here (not exported from actions.ts) because a "use server" module
// may only export async functions — a plain const value export silently
// breaks the whole module at runtime (not caught by lint/tsc).
const initialProfileFormState: ProfileFormState = { status: "idle" };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 flex h-11 w-full items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover active:bg-primary-active disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}

export default function ProfileForm({
  email,
  fullName,
  avatarUrl,
  phone,
  city,
}: {
  email: string;
  fullName: string;
  avatarUrl: string;
  phone: string;
  city: string;
}) {
  const [state, formAction] = useActionState(updateProfile, initialProfileFormState);

  // Tracked locally (rather than left fully uncontrolled) only so the
  // optional avatar preview below can follow what the user is typing.
  const [avatarUrlValue, setAvatarUrlValue] = useState(avatarUrl);
  const [avatarBroken, setAvatarBroken] = useState(false);

  return (
    <div className="flex flex-1 items-center justify-center bg-surface-muted px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Your profile</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Signed in as {email}</p>

        <form action={formAction} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="full_name" className="text-sm font-medium text-foreground">
              Full name
            </label>
            <input
              id="full_name"
              name="full_name"
              type="text"
              defaultValue={fullName}
              placeholder="Your full name"
              className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-zinc-400 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 dark:placeholder:text-zinc-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="avatar_url" className="text-sm font-medium text-foreground">
              Avatar URL
            </label>
            <input
              id="avatar_url"
              name="avatar_url"
              type="url"
              value={avatarUrlValue}
              onChange={(e) => {
                setAvatarUrlValue(e.target.value);
                setAvatarBroken(false);
              }}
              placeholder="https://…"
              className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-zinc-400 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 dark:placeholder:text-zinc-500"
            />
            {avatarUrlValue && !avatarBroken && (
              // Arbitrary external URL entered by the user; next/image would
              // require an upfront remote-pattern allowlist we don't have for
              // M2, so a plain <img> is used instead.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrlValue}
                alt=""
                onError={() => setAvatarBroken(true)}
                className="mt-1 h-16 w-16 rounded-full border border-line object-cover"
              />
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="phone" className="text-sm font-medium text-foreground">
              Phone
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={phone}
              placeholder="(647) 555-0100"
              className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-zinc-400 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 dark:placeholder:text-zinc-500"
            />
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Only visible to you for now.</p>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="city" className="text-sm font-medium text-foreground">
              City
            </label>
            <input
              id="city"
              name="city"
              type="text"
              defaultValue={city}
              placeholder="e.g. Toronto"
              className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-zinc-400 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 dark:placeholder:text-zinc-500"
            />
          </div>

          {state.status === "error" && <p className="text-sm text-danger">{state.message}</p>}
          {state.status === "success" && (
            <p className="text-sm text-success">{state.message}</p>
          )}

          <SaveButton />
        </form>
      </div>
    </div>
  );
}

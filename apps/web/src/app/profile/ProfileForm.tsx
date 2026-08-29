"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { initialProfileFormState, updateProfile } from "./actions";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 flex h-11 w-full items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
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
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16 dark:bg-black">
      <div className="w-full max-w-md rounded-2xl border border-black/[.08] bg-white p-8 dark:border-white/[.145] dark:bg-[#0a0a0a]">
        <h1 className="text-2xl font-semibold text-foreground">Your profile</h1>
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
              className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm text-foreground dark:border-white/[.145]"
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
              className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm text-foreground dark:border-white/[.145]"
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
                className="mt-1 h-16 w-16 rounded-full border border-black/[.08] object-cover dark:border-white/[.145]"
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
              className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm text-foreground dark:border-white/[.145]"
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
              className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm text-foreground dark:border-white/[.145]"
            />
          </div>

          {state.status === "error" && <p className="text-sm text-red-600">{state.message}</p>}
          {state.status === "success" && (
            <p className="text-sm text-green-600">{state.message}</p>
          )}

          <SaveButton />
        </form>
      </div>
    </div>
  );
}

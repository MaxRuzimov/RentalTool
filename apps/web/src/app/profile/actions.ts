"use server";

import { createClient } from "@/lib/supabase/server";

export type ProfileFormState = {
  status: "idle" | "success" | "error";
  message?: string;
};

/**
 * Saves the current user's editable profile fields in one `update` call
 * (spec §4). RLS's "Users can update their own profile" policy
 * (auth.uid() = id) is what actually authorizes this — the `.eq("id", ...)`
 * below just targets the right row.
 */
export async function updateProfile(
  _prevState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const full_name = String(formData.get("full_name") ?? "").trim();
  const avatar_url = String(formData.get("avatar_url") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();

  // M14 fix: field-length bounds server-side, re-checking what the client
  // (ProfileForm) doesn't currently enforce at all beyond the `avatar_url`
  // input's `type="url"` — full_name/phone/city have no client-side
  // `maxLength` either. Chosen limits are generous (well above any
  // legitimate value) purely to stop an unbounded string from being written
  // via a hand-built request; the profiles table has no column-length
  // constraint of its own (`text`, unbounded) so this is the only boundary.
  if (full_name.length > 100) {
    return { status: "error", message: "Full name must be 100 characters or fewer." };
  }
  if (phone.length > 30) {
    return { status: "error", message: "Phone number must be 30 characters or fewer." };
  }
  if (city.length > 100) {
    return { status: "error", message: "City must be 100 characters or fewer." };
  }
  if (avatar_url.length > 2000) {
    return { status: "error", message: "Avatar URL is too long." };
  }
  // Deliberately NOT re-validating avatar_url as a well-formed URL
  // server-side (only the length cap above) — per spec §4 ("if provided,
  // must be `type="url"` — rely on native validation; no need for stricter
  // checks"), this is an intentional exception to this app's usual
  // "server re-validates everything the client checks" convention. A
  // malformed value here is low-risk: it's only ever rendered as an `<img
  // src>` (see ProfileForm's `onError` fallback), never interpreted as a
  // trusted URL server-side.

  const supabase = await createClient();

  // M14 fix: wrapped in try/catch as a backstop for unexpected failures
  // (e.g. a network error/timeout reaching Supabase) that aren't already
  // surfaced as a checked `{ data, error }` result below. This action is
  // invoked via `useActionState`/`formAction` (see ProfileForm), so an
  // uncaught throw here wouldn't just leave a button stuck — with no
  // error.tsx boundary in this app (see apps/web/src/app/error.tsx added in
  // this same milestone), it would otherwise surface as a blank, unstyled
  // Next.js crash page.
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        status: "error",
        message: "Your session has expired. Please log in again.",
      };
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: full_name || null,
        avatar_url: avatar_url || null,
        phone: phone || null,
        city: city || null,
      })
      .eq("id", user.id);

    if (error) {
      console.error(error);
      return { status: "error", message: "Could not save changes. Please try again." };
    }

    return { status: "success", message: "Profile updated." };
  } catch (err) {
    console.error("updateProfile: unexpected error", err);
    return { status: "error", message: "Could not save changes. Please try again." };
  }
}

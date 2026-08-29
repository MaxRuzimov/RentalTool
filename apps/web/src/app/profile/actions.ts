"use server";

import { createClient } from "@/lib/supabase/server";

export type ProfileFormState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export const initialProfileFormState: ProfileFormState = { status: "idle" };

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

  const supabase = await createClient();
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
}

"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Signs the current user out and redirects home. Used by the header's
 * "Log out" control (see docs/design/m2-auth-spec.md §1).
 *
 * M14 fix: `signOut()`'s result was previously neither checked nor guarded —
 * an unexpected throw (e.g. a network error reaching Supabase's auth
 * server) would propagate out of this Server Action uncaught. Logging out
 * should never leave the user stuck on a dead "Log out" button with no
 * feedback, so any failure here is logged and swallowed: the redirect to
 * `/` still happens either way, and `createClient()`'s cookie-backed
 * session is what actually determines logged-in state on the next request,
 * not whether the upstream signOut() call round-tripped successfully.
 */
export async function logout() {
  const supabase = await createClient();
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("logout: signOut returned an error", error);
    }
  } catch (err) {
    console.error("logout: unexpected error", err);
  }
  redirect("/");
}

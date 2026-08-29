import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The `listing-images` bucket is private (not the bucket-level `public`
 * flag) per the task's storage-security constraint — reads go through
 * `storage.objects` RLS (see the M3 migration) plus a short-lived signed
 * URL, rather than a permanently-public bucket URL. Signed URLs are
 * generated per request (server components re-render per request, so these
 * are always fresh) with a generous expiry since there's no client-side
 * caching of them across requests to worry about.
 */
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60; // 1 hour

export async function signImageUrls(
  supabase: SupabaseClient,
  paths: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (paths.length === 0) return result;

  const { data, error } = await supabase.storage
    .from("listing-images")
    .createSignedUrls(paths, SIGNED_URL_EXPIRY_SECONDS);

  if (error || !data) {
    console.error("createSignedUrls failed", error);
    return result;
  }

  for (const item of data) {
    if (item.signedUrl && !item.error) {
      result.set(item.path ?? "", item.signedUrl);
    }
  }
  return result;
}

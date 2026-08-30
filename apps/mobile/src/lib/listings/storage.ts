import { supabase } from "@/lib/supabase/client";

/**
 * Port of `apps/web/src/lib/listings/storage.ts` — the `listing-images`
 * bucket is private, so reads go through a short-lived signed URL rather
 * than a public bucket URL. Storage's "Anyone can read listing images"
 * policy (00000000000002_listings.sql) authorizes this for both anon and
 * authenticated callers, same as web.
 */
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60; // 1 hour

export async function signImageUrls(paths: string[]): Promise<Map<string, string>> {
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

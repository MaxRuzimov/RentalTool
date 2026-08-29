/**
 * Client-side image upload limits (spec docs/design/m3-listings-spec.md §4).
 * Real MIME/size enforcement lives on the `listing-images` Storage bucket
 * config (supabase/config.toml locally; must match on the real project) —
 * these constants are for fast, friendly client-side feedback only.
 */
export const MAX_IMAGES = 6;
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const ACCEPTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
export const ACCEPT_ATTR = "image/jpeg,image/png,image/webp";

export function isAcceptedImageFile(file: File): boolean {
  if ((ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) return true;
  const lowerName = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
}

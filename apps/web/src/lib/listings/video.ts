/**
 * Client-side video upload limits (spec docs/design/video-upload-spec.md
 * §3). Real MIME/size enforcement lives on the `listing-videos` Storage
 * bucket config (supabase/config.toml locally; must match on the real
 * project) — these constants are for fast, friendly client-side feedback
 * only. Duration has no server-side backstop for MVP (spec §3) — it's a
 * client-side-only soft limit.
 */
export const MAX_VIDEOS = 1;
export const MAX_VIDEO_FILE_SIZE_BYTES = 75 * 1024 * 1024;
export const MAX_VIDEO_DURATION_SECONDS = 60;
export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/quicktime"] as const;
export const ACCEPTED_VIDEO_EXTENSIONS = [".mp4", ".mov"];
export const VIDEO_ACCEPT_ATTR = "video/mp4,video/quicktime";

export function isAcceptedVideoFile(file: File): boolean {
  if ((ACCEPTED_VIDEO_TYPES as readonly string[]).includes(file.type)) return true;
  const lowerName = file.name.toLowerCase();
  return ACCEPTED_VIDEO_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
}

/**
 * Reads a video file's duration (seconds) client-side via an offscreen
 * `<video>` element's `loadedmetadata` event (spec §3). Used to reject
 * clips over MAX_VIDEO_DURATION_SECONDS before staging them.
 */
export function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";

    function cleanup() {
      URL.revokeObjectURL(url);
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
    }

    function onLoaded() {
      const duration = video.duration;
      cleanup();
      resolve(duration);
    }

    function onError() {
      cleanup();
      reject(new Error("Could not read video metadata"));
    }

    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("error", onError);
    video.src = url;
  });
}

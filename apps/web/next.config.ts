import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default Server Actions body limit is 1MB. ListingForm submits photos
      // and video together in a single Server Action call, so the worst case
      // is the combined max, not just the video alone: up to MAX_IMAGES (6)
      // photos at MAX_FILE_SIZE_BYTES (5MB) each = 30MB, plus one video at
      // MAX_VIDEO_FILE_SIZE_BYTES (75MB), for a 105MB payload. 120MB gives
      // ~15MB of headroom for multipart/form-data boundaries and headers.
      bodySizeLimit: "120mb",
    },
  },
};

export default nextConfig;

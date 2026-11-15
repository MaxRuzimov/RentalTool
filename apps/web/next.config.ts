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
    // IMPORTANT: this is a SEPARATE cap from serverActions.bodySizeLimit above,
    // and both must be raised together or large uploads fail even though only
    // one limit looks "fixed". Next's proxy layer (apps/web/src/proxy.ts, our
    // Supabase session-refresh proxy, matched on /listings/new and
    // /listings/[id]/edit among other routes) clones/buffers the incoming
    // request body independently of the Server Action body limit, and defaults
    // to capping that buffered clone at 10MB. If a request exceeds it, the
    // proxy only buffers the first 10MB and callers see
    // "Request body exceeded 10MB ... Unexpected end of form" even when
    // serverActions.bodySizeLimit is already large enough. Set this to match
    // serverActions.bodySizeLimit so neither cap is the bottleneck.
    proxyClientMaxBodySize: "120mb",
  },
};

export default nextConfig;

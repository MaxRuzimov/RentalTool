import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // M16 §8 addendum: listing photos/video no longer travel through this
      // Server Action as file bytes — ListingForm uploads them client-direct
      // to Supabase Storage instead (see @/lib/listings/clientUpload), both
      // because Vercel enforces its own hard, non-configurable 4.5MB request
      // body limit on every Function regardless of this setting, and because
      // once uploads moved client-side there's no longer any reason to carry
      // a large-upload-sized cap here. createListing/updateListing now only
      // ever receive ordinary text/number form fields (title, description,
      // category, price, location), so 2MB is already generous headroom over
      // a real-world submission (the 2000-character description cap alone is
      // under 4KB) — comfortably under Vercel's 4.5MB ceiling with plenty of
      // margin for multipart/form-data boundaries and headers.
      bodySizeLimit: "2mb",
    },
    // Separate cap from serverActions.bodySizeLimit above — Next's proxy
    // layer (apps/web/src/proxy.ts, our Supabase session-refresh proxy)
    // clones/buffers the incoming request body independently and defaults to
    // capping that buffered clone at 10MB, which is already comfortably
    // above the 2MB fields-only payload this app now sends, so no override
    // is needed here at all. Kept explicit (matching the value above) so a
    // future reader doesn't have to go hunting for Next's default and can
    // see both caps are intentionally modest for the same reason.
    proxyClientMaxBodySize: "2mb",
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default Server Actions body limit is 1MB. Video uploads on
      // /listings/new need headroom up to the spec's 75MB max file size,
      // plus multipart/form-data overhead.
      bodySizeLimit: "80mb",
    },
  },
};

export default nextConfig;

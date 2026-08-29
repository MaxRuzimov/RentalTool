"use client";

import { useState } from "react";

/**
 * Same fail-silently `onError` pattern as the profile page's avatar preview
 * (spec §5.5) — a small client component since inline event handlers aren't
 * allowed on elements rendered from a Server Component.
 */
export default function OwnerAvatar({ url }: { url: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      onError={() => setBroken(true)}
      className="h-10 w-10 rounded-full object-cover"
    />
  );
}

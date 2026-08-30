/**
 * Shared star-rating display/input (spec §9) — the one new visual primitive
 * this milestone introduces, same "small, reusable, plain-Tailwind"
 * precedent as `StatusBadge`. Five Unicode glyphs (★ filled / ☆ empty), not
 * an SVG icon set or an npm star-rating package — zero new dependency.
 *
 * No "use client" directive here: in read-only mode this is a plain
 * presentational component usable directly from server components (the
 * listing detail page, review list rows). In interactive mode it's only
 * ever rendered from within `ReviewForm`, a client component — Next.js
 * bundles this module for the client automatically in that tree, so a
 * separate client copy isn't needed.
 */
const SIZE_CLASSES: Record<"sm" | "md", string> = {
  sm: "text-base",
  md: "text-lg",
};

export default function StarRating({
  rating,
  interactive = false,
  onChange,
  size = "md",
}: {
  rating: number;
  interactive?: boolean;
  onChange?: (value: number) => void;
  size?: "sm" | "md";
}) {
  // Fractional aggregate averages round to the nearest whole star for the
  // visual fill (spec §6.1); an exact integer input rounds to itself, so no
  // special-casing is needed between the two use cases.
  const filledCount = Math.round(rating);
  const stars = [1, 2, 3, 4, 5];
  const sizeClass = SIZE_CLASSES[size];

  return (
    <span
      className={`inline-flex ${sizeClass} leading-none ${interactive ? "gap-0.5" : ""}`}
      aria-label={`${rating} out of 5 stars`}
    >
      {stars.map((n) => {
        const filled = n <= filledCount;
        const glyph = filled ? "★" : "☆";
        const colorClass = filled ? "text-amber-500" : "text-zinc-300 dark:text-zinc-600";

        if (interactive) {
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange?.(n)}
              aria-label={`Rate ${n} star${n === 1 ? "" : "s"}`}
              className={`${colorClass} cursor-pointer p-1.5 -m-1.5`}
            >
              {glyph}
            </button>
          );
        }

        return (
          <span key={n} className={colorClass}>
            {glyph}
          </span>
        );
      })}
    </span>
  );
}

/**
 * No-photo placeholder (spec §9): a plain light-gray box with the listing's
 * first letter — no stock photo, no external placeholder-image service.
 */
export default function ImagePlaceholder({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  const initial = label.trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      className={`flex items-center justify-center bg-zinc-100 text-2xl font-semibold text-zinc-400 dark:bg-zinc-900 dark:text-zinc-600 ${className}`}
    >
      {initial}
    </div>
  );
}

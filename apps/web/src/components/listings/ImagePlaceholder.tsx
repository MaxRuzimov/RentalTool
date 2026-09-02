import { Wrench } from "lucide-react";

/**
 * No-photo placeholder (spec §5): a centered generic wrench icon on the
 * app's recessed-surface tokens — no stock photo, no external
 * placeholder-image service, consistent with M3's original constraint.
 */
export default function ImagePlaceholder({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center border border-line bg-surface-muted ${className}`}
    >
      <Wrench className="h-8 w-8 text-zinc-400 dark:text-zinc-500" strokeWidth={1.5} aria-hidden="true" />
    </div>
  );
}

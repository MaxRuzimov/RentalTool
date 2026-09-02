import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Shared empty-state container (spec §2.2) — same `rounded-2xl border ...
 * py-16 text-center` shell used across the app's 5 full-page empty states,
 * now with a considered icon-in-a-badge visual anchor above the copy.
 */
export default function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-line py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted">
        <Icon className="h-6 w-6 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-foreground">{title}</p>
        {description && <p className="text-sm text-zinc-500 dark:text-zinc-400">{description}</p>}
      </div>
      {children}
    </div>
  );
}

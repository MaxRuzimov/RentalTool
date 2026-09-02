/** Shared loading-skeleton primitive for route `loading.tsx` files (spec §1.2). */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-surface-muted ${className}`} />;
}

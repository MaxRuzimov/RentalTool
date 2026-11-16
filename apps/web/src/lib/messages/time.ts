/**
 * Shared relative-time formatter for the inbox list (spec §3.2's "Relative/
 * short timestamp of `last_message_at`"). Deliberately NOT used for the
 * thread view's per-message timestamps (spec §3.3 — those use the viewer's
 * actual local wall-clock time via `toLocaleString` in the client
 * component instead). A relative diff ("5m ago") is safe to compute
 * server-side with no viewer-timezone ambiguity: it's a difference between
 * two instants, not an absolute-time rendering, so there's nothing for a
 * server-vs-viewer timezone mismatch to get wrong here (unlike a bare
 * `date` field, e.g. a booking's `start_date`).
 */
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - then);
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek < 5) return `${diffWeek}w ago`;

  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

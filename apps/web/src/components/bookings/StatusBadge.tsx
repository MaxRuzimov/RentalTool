/**
 * Booking status pill (spec §7) — the first badge component in the app,
 * kept intentionally minimal (background + text color only, no icons).
 * Reused identically on /bookings/mine and /bookings/owner-requests.
 */
const STATUS_STYLES: Record<string, { label: string; classes: string }> = {
  pending: { label: "Pending", classes: "bg-warning-bg text-warning-foreground" },
  approved: { label: "Approved", classes: "bg-success-bg text-success-foreground" },
  declined: { label: "Declined", classes: "bg-danger-bg text-danger-foreground" },
  cancelled: {
    label: "Cancelled",
    classes: "bg-surface-muted text-zinc-600 dark:text-zinc-400",
  },
};

export default function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? {
    label: status,
    classes: "bg-surface-muted text-zinc-600 dark:text-zinc-400",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style.classes}`}
    >
      {style.label}
    </span>
  );
}

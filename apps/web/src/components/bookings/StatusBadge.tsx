/**
 * Booking status pill (spec §7) — the first badge component in the app,
 * kept intentionally minimal (background + text color only, no icons).
 * Reused identically on /bookings/mine and /bookings/owner-requests.
 */
const STATUS_STYLES: Record<string, { label: string; classes: string }> = {
  pending: {
    label: "Pending",
    classes: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  },
  approved: {
    label: "Approved",
    classes: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  },
  declined: {
    label: "Declined",
    classes: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  },
  cancelled: {
    label: "Cancelled",
    classes: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  },
};

export default function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? { label: status, classes: "bg-zinc-100 text-zinc-600" };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style.classes}`}
    >
      {style.label}
    </span>
  );
}

import Link from "next/link";
import { Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/lib/auth/actions";
import { todayISODate } from "@/lib/bookings/pricing";
import LogoutButton from "./LogoutButton";

/**
 * Site header / nav (spec §1). Server Component so auth state is read from
 * the Supabase server client / cookies and rendered on first paint — no
 * logged-out flash.
 */
export default async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let fullName: string | null = null;
  let pendingRequestCount = 0;
  let approvedUpcomingCount = 0;
  let unreadMessageCount = 0;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    fullName = profile?.full_name ?? null;

    // Count of pending requests on listings this user owns — same
    // `listings!inner` + `.eq("listings.owner_id", ...)` scoping pattern as
    // /bookings/owner-requests's own query, `head: true` so only the count
    // is returned (no row data needed for a badge number).
    const { count } = await supabase
      .from("bookings")
      .select("id, listings!inner(owner_id)", { count: "exact", head: true })
      .eq("status", "pending")
      .eq("listings.owner_id", user.id);
    pendingRequestCount = count ?? 0;

    // Renter-side symmetry (booking-approval-followup-spec.md §A): count of
    // this user's own approved bookings that haven't ended yet. No join to
    // `listings` needed — unlike the owner query above, `renter_id` lives
    // directly on `bookings`. `today` must come from `todayISODate()`
    // (America/Toronto), never a raw `Date`/`toISOString()` comparison.
    const { count: approvedCount } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("renter_id", user.id)
      .eq("status", "approved")
      .gte("end_date", todayISODate());
    approvedUpcomingCount = approvedCount ?? 0;

    // M20 (chat-spec §2.4/§5): total unread message count, summed from the
    // same `my_conversation_unread_counts()` result set `/messages` keys its
    // own per-row badges off — one source of truth, not two separately
    // maintained counts. Computed fresh per request/navigation, same
    // "not itself realtime-subscribed" convention as `pendingRequestCount`
    // above (spec §2.5's explicit scoping).
    const { data: unreadRows } = await supabase.rpc("my_conversation_unread_counts");
    unreadMessageCount = (unreadRows ?? []).reduce(
      (sum: number, row: { unread_count: number }) => sum + Number(row.unread_count),
      0,
    );
  }

  return (
    <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line bg-background/70 px-4 py-4 backdrop-blur-md sm:px-6">
      <Link
        href="/"
        className="flex items-center gap-2 rounded-sm text-base font-semibold text-accent transition-colors hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Wrench className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </span>
        RentalTool
      </Link>

      <nav className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm font-medium">
        <Link
          href="/listings"
          className="rounded-sm text-zinc-600 hover:text-primary hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-zinc-300"
        >
          Browse listings
        </Link>
        {user ? (
          <>
            <Link
              href="/listings/mine"
              className="rounded-sm text-zinc-600 hover:text-primary hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-zinc-300"
            >
              My listings
            </Link>
            <Link
              href="/bookings/mine"
              className="relative rounded-sm text-zinc-600 hover:text-primary hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-zinc-300"
            >
              Bookings
              {pendingRequestCount > 0 && (
                <span
                  className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground"
                  aria-label={`${pendingRequestCount} pending booking request${pendingRequestCount === 1 ? "" : "s"}`}
                >
                  {pendingRequestCount > 99 ? "99+" : pendingRequestCount}
                </span>
              )}
              {/* Distinct green pill, separate from the primary pending-pill
                  above (spec §A.2/§A.4) — "approved, nothing to act on"
                  shouldn't share the "action needed" color, and both pills
                  can render at once since a user can be both owner and
                  renter. */}
              {approvedUpcomingCount > 0 && (
                <span
                  className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-success-bg px-1.5 text-xs font-semibold text-success-foreground"
                  aria-label={`${approvedUpcomingCount} active upcoming approved booking${approvedUpcomingCount === 1 ? "" : "s"}`}
                >
                  {approvedUpcomingCount > 99 ? "99+" : approvedUpcomingCount}
                </span>
              )}
            </Link>
            <Link
              href="/messages"
              className="relative rounded-sm text-zinc-600 hover:text-primary hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-zinc-300"
            >
              Messages
              {unreadMessageCount > 0 && (
                <span
                  className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground"
                  aria-label={`${unreadMessageCount} unread message${unreadMessageCount === 1 ? "" : "s"}`}
                >
                  {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
                </span>
              )}
            </Link>
            <Link
              href="/profile"
              className="max-w-[10rem] truncate rounded-sm text-zinc-600 hover:text-primary hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-zinc-300"
            >
              {fullName || "Account"}
            </Link>
            <form action={logout}>
              <LogoutButton />
            </form>
          </>
        ) : (
          <>
            <Link
              href="/login"
              className="rounded-sm text-zinc-600 hover:text-primary hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-zinc-300"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="flex h-9 items-center justify-center rounded-full bg-primary px-4 text-primary-foreground transition-colors hover:bg-primary-hover active:bg-primary-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Sign up
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}

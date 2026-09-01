import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/lib/auth/actions";

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
  }

  return (
    <header className="flex flex-wrap items-center justify-between gap-y-2 border-b border-line px-4 py-4 sm:px-6">
      <Link href="/" className="text-base font-semibold text-accent">
        RentalTool
      </Link>

      <nav className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm font-medium">
        <Link
          href="/listings"
          className="text-zinc-600 hover:text-primary hover:underline underline-offset-2 dark:text-zinc-300"
        >
          Browse listings
        </Link>
        {user ? (
          <>
            <Link
              href="/listings/mine"
              className="text-zinc-600 hover:text-primary hover:underline underline-offset-2 dark:text-zinc-300"
            >
              My listings
            </Link>
            <Link
              href="/bookings/mine"
              className="relative text-zinc-600 hover:text-primary hover:underline underline-offset-2 dark:text-zinc-300"
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
            </Link>
            <Link
              href="/profile"
              className="max-w-[10rem] truncate text-zinc-600 hover:text-primary hover:underline underline-offset-2 dark:text-zinc-300"
            >
              {fullName || "Account"}
            </Link>
            <form action={logout}>
              <button
                type="submit"
                className="flex h-9 items-center justify-center rounded-full border border-line px-4 transition-colors hover:border-transparent hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Log out
              </button>
            </form>
          </>
        ) : (
          <>
            <Link
              href="/login"
              className="text-zinc-600 hover:text-primary hover:underline underline-offset-2 dark:text-zinc-300"
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

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
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    fullName = profile?.full_name ?? null;
  }

  return (
    <header className="flex items-center justify-between border-b border-black/[.08] px-6 py-4 dark:border-white/[.145]">
      <Link href="/" className="text-base font-semibold text-foreground">
        RentalTool
      </Link>

      <nav className="flex items-center gap-4 text-sm font-medium">
        {user ? (
          <>
            <Link href="/profile" className="text-foreground hover:underline">
              {fullName || "Account"}
            </Link>
            <form action={logout}>
              <button
                type="submit"
                className="flex h-9 items-center justify-center rounded-full border border-solid border-black/[.08] px-4 transition-colors hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
              >
                Log out
              </button>
            </form>
          </>
        ) : (
          <>
            <Link href="/login" className="text-foreground hover:underline">
              Log in
            </Link>
            <Link
              href="/signup"
              className="flex h-9 items-center justify-center rounded-full bg-foreground px-4 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              Sign up
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}

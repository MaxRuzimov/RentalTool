import Link from "next/link";

/**
 * Minimal site footer. Currently exists to make the legally-required
 * privacy policy (M11, Google Play submission requirement) discoverable
 * from normal navigation rather than only reachable by a direct URL.
 * Deliberately small — not a full multi-column footer.
 */
export default function Footer() {
  return (
    <footer className="border-t border-line px-4 py-6 sm:px-6">
      <nav className="mx-auto flex max-w-3xl items-center justify-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
        <Link
          href="/privacy"
          className="rounded-sm hover:text-primary hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Privacy
        </Link>
      </nav>
    </footer>
  );
}

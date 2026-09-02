import Link from "next/link";
import { Wrench } from "lucide-react";

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-surface-muted px-4 py-16">
      <Wrench
        className="pointer-events-none absolute h-72 w-72 text-primary/10"
        strokeWidth={1}
        aria-hidden="true"
      />
      <div className="relative flex w-full max-w-2xl flex-col items-center gap-3 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Rent the tool you need, from someone nearby.
        </h1>
        <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
          Browse tools listed by people in the GTA, or list your own gear to earn
          a little extra when you&apos;re not using it.
        </p>
        <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link
            href="/signup"
            className="flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover active:bg-primary-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Get started
          </Link>
          <Link
            href="/listings"
            className="flex h-11 items-center justify-center rounded-full border border-line px-6 text-sm font-medium text-foreground transition-colors hover:border-transparent hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Browse listings
          </Link>
        </div>
      </div>
    </div>
  );
}

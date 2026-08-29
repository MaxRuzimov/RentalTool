import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in Client Components (the browser).
 *
 * Reads and writes the auth session via cookies (not localStorage) so that
 * the same session is visible to Server Components, Server Actions, and
 * Route Handlers. Cookie handling is managed automatically by
 * `@supabase/ssr` — no custom `cookies` adapter is needed here.
 *
 * Create a new client per call site (cheap — it does not open a new
 * connection); do not hoist a single instance into module scope shared
 * across unrelated components.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

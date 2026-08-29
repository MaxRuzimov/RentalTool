import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for use in Server Components, Server Actions, and Route
 * Handlers.
 *
 * Next.js 16's `cookies()` from `next/headers` is an async function, so this
 * helper is async too — call it as `const supabase = await createClient()`.
 *
 * `cookieStore.set()` can only succeed when called from a Server Action or
 * Route Handler (Next.js forbids writing cookies during Server Component
 * rendering). When `setAll` is invoked from a Server Component — e.g. because
 * the Supabase client attempted a token refresh — the `.set()` calls throw;
 * that's caught and ignored here. In that case session refresh instead relies
 * on `proxy.ts` running first and writing the refreshed cookies to the
 * response, which the Server Component then reads. See
 * https://supabase.com/docs/guides/auth/server-side/nextjs for the pattern
 * this follows.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component — ignore. Session refresh is
            // instead handled by proxy.ts on the request path.
          }
        },
      },
    },
  );
}

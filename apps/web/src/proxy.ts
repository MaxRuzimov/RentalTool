import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session on every matched request.
 *
 * Note on naming: Next.js 16 renamed the `middleware.ts` file convention to
 * `proxy.ts` (the exported function is now named `proxy` instead of
 * `middleware`); the old `middleware.ts` convention still resolves but is
 * deprecated, so new code should use `proxy.ts`. See
 * https://nextjs.org/docs/app/api-reference/file-conventions/proxy — the
 * runtime behavior described there (and in the Supabase SSR guides as
 * "middleware") is otherwise unchanged: this still runs before rendering,
 * reads the incoming session cookie, refreshes it if expired, and writes any
 * updated cookie back onto the response so Server Components see a valid
 * session.
 *
 * Read/write access to `next/headers` `cookies()` from Server Components is
 * read-only, so if the access token has expired by the time a Server
 * Component runs, it can't persist a refreshed session itself — this proxy
 * is what keeps the session current for them.
 */
export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          // Write to the request too, so this same request cycle sees the
          // refreshed cookies if anything downstream re-reads them.
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
          Object.entries(headers).forEach(([key, value]) => {
            supabaseResponse.headers.set(key, value);
          });
        },
      },
    },
  );

  // IMPORTANT: Avoid writing any logic between `createServerClient` and
  // `supabase.auth.getClaims()`. A mistake here can make it very hard to
  // debug users being randomly logged out.
  await supabase.auth.getClaims();

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - common static asset extensions
     */
    "/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)",
  ],
};

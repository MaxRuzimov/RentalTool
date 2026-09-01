import LoginForm from "./LoginForm";

// Server Component wrapper: `searchParams` is a Promise in Next.js 16, so it
// must be awaited server-side before handing `redirectTo` down to the
// interactive (Client Component) form — see spec §3/§5.
export default async function LoginPage({
  searchParams,
}: {
  // Next.js gives a string[] for a repeated query param (?redirectTo=a&redirectTo=b),
  // not just a string — guard the type before it reaches safeRedirectTarget's
  // string-only checks in LoginForm.
  searchParams: Promise<{ redirectTo?: string | string[]; confirmError?: string }>;
}) {
  const { redirectTo, confirmError } = await searchParams;

  return (
    <LoginForm
      redirectTo={typeof redirectTo === "string" ? redirectTo : undefined}
      confirmError={Boolean(confirmError)}
    />
  );
}

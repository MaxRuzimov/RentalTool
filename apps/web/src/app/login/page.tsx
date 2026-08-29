import LoginForm from "./LoginForm";

// Server Component wrapper: `searchParams` is a Promise in Next.js 16, so it
// must be awaited server-side before handing `redirectTo` down to the
// interactive (Client Component) form — see spec §3/§5.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { redirectTo } = await searchParams;

  return <LoginForm redirectTo={redirectTo} />;
}

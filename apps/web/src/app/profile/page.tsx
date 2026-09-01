import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProfileForm from "./ProfileForm";

// Route protection (spec §5): server-side check, not a client-only
// useEffect redirect, so a signed-out visitor never sees a flash of
// protected content.
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ confirmed?: string }>;
}) {
  const { confirmed } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/profile");
  }

  // Full row (not `public_profiles`) — this is the owner's own page, so
  // `phone` should be visible here. RLS's "Users can view their own full
  // profile" policy (auth.uid() = id) authorizes this select.
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url, phone, city")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <ProfileForm
      email={user.email ?? ""}
      fullName={profile?.full_name ?? ""}
      avatarUrl={profile?.avatar_url ?? ""}
      phone={profile?.phone ?? ""}
      city={profile?.city ?? ""}
      justConfirmed={Boolean(confirmed)}
    />
  );
}

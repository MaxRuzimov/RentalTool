import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ListingForm from "@/components/listings/ListingForm";

// Route protection (spec §6): server-side check, same pattern as /profile.
export default async function NewListingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/listings/new");
  }

  return <ListingForm mode="create" />;
}

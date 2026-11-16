import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { markConversationRead } from "../actions";
import MessageThread, { type ThreadMessage } from "@/components/messages/MessageThread";

/**
 * Thread view (spec §3.3) — Server Component. Loads the conversation
 * (independently re-verifying participancy before rendering anything —
 * RLS already guarantees a non-participant's select returns nothing, same
 * "RLS is primary, but the server component double-checks and 404s cleanly"
 * convention `ListingDetailPage` follows for its own listing lookup) and
 * the full message history, then hands off to the `MessageThread` Client
 * Component for the live/composer part.
 */
export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirectTo=${encodeURIComponent(`/messages/${id}`)}`);
  }

  const { data: conversationData } = await supabase
    .from("conversations")
    .select("id, listing_id, owner_id, renter_id, listings(title)")
    .eq("id", id)
    .maybeSingle();

  const conversation = conversationData as unknown as {
    id: string;
    listing_id: string;
    owner_id: string;
    renter_id: string;
    listings: { title: string } | null;
  } | null;

  if (!conversation || (conversation.owner_id !== user.id && conversation.renter_id !== user.id)) {
    notFound();
  }

  const { data: messagesData } = await supabase
    .from("messages")
    .select("id, sender_id, body, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  const isOwnerView = conversation.owner_id === user.id;
  const otherId = isOwnerView ? conversation.renter_id : conversation.owner_id;
  const { data: otherProfile } = await supabase
    .from("public_profiles")
    .select("full_name, avatar_url")
    .eq("id", otherId)
    .maybeSingle();

  // Spec §3.3 step 3 — fires on every load of this page, not just the
  // first; see markConversationRead's own comment for why this deliberately
  // doesn't revalidate any path.
  await markConversationRead(id);

  const listingTitle = conversation.listings?.title ?? null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-12">
      <Link
        href="/messages"
        className="text-sm font-medium text-accent underline-offset-2 hover:underline hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
      >
        Back to messages
      </Link>

      <div className="mt-3 flex items-center gap-3">
        {otherProfile?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={otherProfile.avatar_url}
            alt=""
            className="h-10 w-10 shrink-0 rounded-full object-cover"
          />
        ) : null}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {otherProfile?.full_name || "A RentalTool user"}
          </h1>
          <Link
            href={`/listings/${conversation.listing_id}`}
            className="text-sm text-zinc-500 underline-offset-2 hover:text-primary hover:underline dark:text-zinc-400"
          >
            {listingTitle || "View listing"}
          </Link>
        </div>
      </div>

      <div className="mt-6 flex-1">
        <MessageThread
          conversationId={id}
          currentUserId={user.id}
          initialMessages={(messagesData ?? []) as ThreadMessage[]}
        />
      </div>
    </div>
  );
}

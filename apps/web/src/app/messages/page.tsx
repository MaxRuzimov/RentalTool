import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import EmptyState from "@/components/ui/EmptyState";
import { formatRelativeTime } from "@/lib/messages/time";

type ConversationRow = {
  id: string;
  listing_id: string;
  owner_id: string;
  renter_id: string;
  last_message_at: string;
  last_message_preview: string | null;
  listings: { title: string } | null;
};

/**
 * Inbox (spec §3.2): one unified list of the caller's conversations, both
 * as owner and as renter, ordered by `last_message_at desc`.
 */
export default async function MessagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/messages");
  }

  const { data: conversationsData } = await supabase
    .from("conversations")
    .select(
      "id, listing_id, owner_id, renter_id, last_message_at, last_message_preview, listings(title)",
    )
    .or(`owner_id.eq.${user.id},renter_id.eq.${user.id}`)
    .order("last_message_at", { ascending: false });

  const conversations = (conversationsData ?? []) as unknown as ConversationRow[];

  // Single source of truth for unread counts (spec §2.4) — backs both this
  // page's per-row badges and (summed) the header's total badge, via two
  // independent calls to the same function rather than two query shapes.
  const { data: unreadData } = await supabase.rpc("my_conversation_unread_counts");
  const unreadByConversationId = new Map<string, number>(
    (unreadData ?? []).map((r: { conversation_id: string; unread_count: number }) => [
      r.conversation_id,
      Number(r.unread_count),
    ]),
  );

  const otherPartyIds = [
    ...new Set(conversations.map((c) => (c.owner_id === user.id ? c.renter_id : c.owner_id))),
  ];
  const { data: profiles } =
    otherPartyIds.length > 0
      ? await supabase
          .from("public_profiles")
          .select("id, full_name, avatar_url")
          .in("id", otherPartyIds)
      : { data: [] as { id: string; full_name: string | null; avatar_url: string | null }[] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Messages</h1>

      {conversations.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={MessageSquare}
            title="No messages yet"
            description="Message a listing owner from any listing page to start a conversation."
          />
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-3">
          {conversations.map((c) => {
            const isOwnerView = c.owner_id === user.id;
            const otherId = isOwnerView ? c.renter_id : c.owner_id;
            const otherProfile = profileById.get(otherId);
            const unread = unreadByConversationId.get(c.id) ?? 0;
            const displayName = otherProfile?.full_name || "A RentalTool user";

            return (
              <div
                key={c.id}
                className="rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-primary/40"
              >
                <Link href={`/messages/${c.id}`} className="flex items-center gap-3 rounded-sm">
                  {otherProfile?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={otherProfile.avatar_url}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-sm font-medium text-zinc-500 dark:text-zinc-400">
                      {displayName.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
                      <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                        {formatRelativeTime(c.last_message_at)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-zinc-500 dark:text-zinc-400">
                      {c.last_message_preview ?? "No messages yet"}
                    </p>
                  </div>
                  {unread > 0 && (
                    <span
                      className="ml-1 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground"
                      aria-label={`${unread} unread message${unread === 1 ? "" : "s"}`}
                    >
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </Link>
                {/* Not nested inside the thread Link above (two <a> tags can't
                    nest) — a small, separate link to the listing, with a
                    "You" disambiguator when the viewer is this listing's
                    owner (since the unified list mixes both roles). */}
                <Link
                  href={`/listings/${c.listing_id}`}
                  className="mt-2 inline-block truncate text-xs text-zinc-500 underline-offset-2 hover:text-primary hover:underline dark:text-zinc-400"
                >
                  {isOwnerView && <span className="font-medium text-foreground">You</span>}
                  {isOwnerView && " · "}
                  {c.listings?.title ?? "Listing"}
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

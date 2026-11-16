"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type IncomingMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
};

type NewMessageToast = {
  id: string;
  conversationId: string;
  preview: string;
  senderName: string;
};

/**
 * Header's "Messages" nav link + unread badge, split out of the (Server
 * Component) `Header` so it can live-update without a navigation/reload.
 *
 * Bug fix: previously the unread badge was only ever computed server-side
 * on render (Header's own comment called this out as deliberate, matching
 * `pendingRequestCount`'s convention) — correct for a per-request count,
 * but it meant a logged-in user sitting on any page OTHER than the message
 * thread itself got zero signal when a new message arrived until they
 * navigated or reloaded. This component keeps that same server-computed
 * count as the source of truth on every navigation (`initialUnreadCount`),
 * but also opens a live Realtime subscription so the badge ticks up, and a
 * toast appears, the moment a message actually arrives.
 *
 * Subscribes to `public.messages` INSERT with NO `conversation_id` filter
 * (unlike MessageThread's per-conversation subscription) because this
 * component doesn't know in advance every conversation the user
 * participates in. This relies on Postgres RLS gating the realtime
 * changefeed itself, not just normal REST queries — empirically verified
 * against the local Supabase stack as part of this fix (a non-participant
 * subscribed the same unfiltered way received zero rows for a message
 * between two other users; a real participant received exactly their own
 * row), the same authorization boundary MessageThread's subscription
 * already relies on per spec §2.5.
 */
export default function MessagesNavLink({
  currentUserId,
  initialUnreadCount,
}: {
  currentUserId: string;
  initialUnreadCount: number;
}) {
  // `liveDelta` is how much this component has incremented the badge
  // itself, on top of whatever Header last computed server-side.
  // `initialUnreadCount` changes on every navigation/re-render of Header
  // (e.g. visiting `/messages/[id]` marks it read, so the next page's
  // Header render comes back lower) — when that happens the delta must
  // reset to 0, or a locally-incremented count would never come back down.
  // Resetting it during render (React's documented "adjusting state when a
  // prop changes" pattern) rather than in a `useEffect` avoids the extra
  // commit a `setState`-in-effect would cause.
  const [prevInitialUnreadCount, setPrevInitialUnreadCount] = useState(initialUnreadCount);
  const [liveDelta, setLiveDelta] = useState(0);
  if (initialUnreadCount !== prevInitialUnreadCount) {
    setPrevInitialUnreadCount(initialUnreadCount);
    setLiveDelta(0);
  }
  const unreadCount = initialUnreadCount + liveDelta;

  const [toast, setToast] = useState<NewMessageToast | null>(null);

  // Read inside the subscription's handler via a ref, not as an effect
  // dependency — the channel itself should not be torn down and
  // re-subscribed on every navigation, just because the pathname changed.
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const channel = supabase
      .channel(`messages:unread-watch:${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as IncomingMessageRow;
          // Our own sends echo back through this same feed — not "incoming".
          if (row.sender_id === currentUserId) return;
          if (!active) return;
          // Already looking at this exact thread — MessageThread's own
          // subscription already live-appends it there; skip the
          // badge/toast double-signal for a conversation the user is
          // already reading.
          if (pathnameRef.current === `/messages/${row.conversation_id}`) return;

          setLiveDelta((delta) => delta + 1);

          // Best-effort sender name for the toast; the badge update above
          // doesn't depend on this succeeding.
          supabase
            .from("public_profiles")
            .select("full_name")
            .eq("id", row.sender_id)
            .maybeSingle()
            .then(({ data: profile }) => {
              if (!active) return;
              setToast({
                id: row.id,
                conversationId: row.conversation_id,
                preview: row.body.length > 120 ? `${row.body.slice(0, 120)}…` : row.body,
                senderName: profile?.full_name || "A RentalTool user",
              });
            });
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <>
      <Link
        href="/messages"
        className="relative rounded-sm text-zinc-600 hover:text-primary hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-zinc-300"
      >
        Messages
        {unreadCount > 0 && (
          <span
            className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground"
            aria-label={`${unreadCount} unread message${unreadCount === 1 ? "" : "s"}`}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Link>

      {toast && (
        <Link
          href={`/messages/${toast.conversationId}`}
          onClick={() => setToast(null)}
          role="status"
          className="fixed bottom-4 right-4 z-50 flex w-72 flex-col gap-0.5 rounded-xl border border-line bg-surface p-3 shadow-lg transition-colors hover:border-primary/40"
        >
          <span className="text-sm font-medium text-foreground">
            New message from {toast.senderName}
          </span>
          <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">{toast.preview}</span>
        </Link>
      )}
    </>
  );
}

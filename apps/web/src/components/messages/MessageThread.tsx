"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { sendMessage } from "@/app/messages/actions";
import { isRedirectError } from "@/lib/forms/isRedirectError";
import Spinner from "@/components/ui/Spinner";

export type ThreadMessage = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

const MAX_BODY_LENGTH = 2000;

/**
 * Thread view's live message list + composer (spec §3.3/§6.4). Client
 * Component: subscribes to Supabase Realtime `postgres_changes` on
 * `messages` filtered to this conversation (first use of Realtime in this
 * codebase — see spec §2.5's RLS+Realtime interaction notes, QA'd
 * separately per spec §6).
 */
export default function MessageThread({
  conversationId,
  currentUserId,
  initialMessages,
}: {
  conversationId: string;
  currentUserId: string;
  initialMessages: ThreadMessage[];
}) {
  const [messages, setMessages] = useState<ThreadMessage[]>(initialMessages);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef<Set<string>>(new Set(initialMessages.map((m) => m.id)));

  useEffect(() => {
    const supabase = createClient();

    // Subscribes using the browser's already-authenticated client (not a
    // fresh anonymous one) — supabase-js wires the realtime connection's
    // auth token from the existing session automatically, which is what
    // makes the `messages` SELECT RLS policy (spec §2.2) the real
    // authorization boundary for which rows this subscription can actually
    // receive (spec §2.5).
    const channel = supabase
      .channel(`messages:conversation:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as ThreadMessage;
          if (seenIds.current.has(row.id)) return;
          seenIds.current.add(row.id);
          setMessages((prev) => [...prev, row]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || trimmed.length > MAX_BODY_LENGTH || sending) return;

    setSending(true);
    setError(null);

    const formData = new FormData();
    formData.set("body", trimmed);

    try {
      const result = await sendMessage(conversationId, formData);
      if (result.status !== "success") {
        setError(result.status === "error" ? result.message : "Could not send your message. Please try again.");
        return;
      }
      // Optimistic append of the server-assigned row (spec §3.3) — the
      // realtime echo of this same insert will arrive shortly after and is
      // de-duped by id via `seenIds`, so this never double-renders.
      const row: ThreadMessage = {
        id: result.data.id,
        sender_id: currentUserId,
        body: result.data.body,
        created_at: result.data.created_at,
      };
      if (!seenIds.current.has(row.id)) {
        seenIds.current.add(row.id);
        setMessages((prev) => [...prev, row]);
      }
      setBody("");
    } catch (err) {
      if (isRedirectError(err)) {
        throw err;
      }
      console.error("MessageThread send failed", err);
      setError("Could not send your message. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-[20rem] flex-1 flex-col gap-2 overflow-y-auto rounded-2xl border border-line bg-surface p-4">
        {messages.length === 0 ? (
          <p className="m-auto text-sm text-zinc-500 dark:text-zinc-400">
            No messages yet — say hello.
          </p>
        ) : (
          messages.map((message) => {
            const mine = message.sender_id === currentUserId;
            return (
              <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={
                    mine
                      ? "max-w-[75%] rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground"
                      : "max-w-[75%] rounded-2xl border border-line bg-surface-muted px-3 py-2 text-sm text-foreground"
                  }
                >
                  {/* Plain text node only — React escapes this by default,
                      which is the entire XSS defense needed for a
                      plain-text-only chat (spec §7). Never render message
                      bodies via dangerouslySetInnerHTML. */}
                  <p className="whitespace-pre-line break-words">{message.body}</p>
                  <p
                    className={
                      mine
                        ? "mt-1 text-right text-xs text-primary-foreground/70"
                        : "mt-1 text-xs text-zinc-500 dark:text-zinc-400"
                    }
                  >
                    {new Date(message.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <form onSubmit={handleSubmit} className="mt-3 flex items-end gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={MAX_BODY_LENGTH}
          rows={2}
          placeholder="Write a message…"
          aria-label="Message"
          className="w-full flex-1 resize-none rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-zinc-400 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 dark:placeholder:text-zinc-500"
        />
        <button
          type="submit"
          disabled={sending || !body.trim() || body.length > MAX_BODY_LENGTH}
          className="flex h-10 shrink-0 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover active:bg-primary-active disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {sending && <Spinner className="mr-2 h-4 w-4" />}
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
      <p className="mt-1 text-right text-xs text-zinc-500 dark:text-zinc-400">
        {body.length}/{MAX_BODY_LENGTH}
      </p>
    </div>
  );
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type MessageActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export type SendMessageState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; data: { id: string; body: string; created_at: string } };

const COPY = {
  sessionExpired: "Your session has expired. Please log in again.",
  noAccess: "You don't have access to this conversation.",
  blankBody: "Please write a message before sending.",
  tooLong: "Messages must be 2000 characters or fewer.",
};

const MAX_BODY_LENGTH = 2000;

/**
 * Starts (or resumes) the conversation for (listingId, the listing's real
 * owner, the current user as renter) and redirects to its thread view
 * (spec §3.1). `owner_id` is always re-derived from `listings` server-side,
 * never trusted from any client input.
 */
export async function startConversation(listingId: string): Promise<void> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirectTo=${encodeURIComponent(`/listings/${listingId}`)}`);
  }

  // All the fallible lookups/writes are wrapped in try/catch (same
  // "unexpected failure shouldn't throw all the way out of a Server
  // Action" convention as createBookingRequest) — but every `redirect()`
  // call itself stays OUTSIDE this block, since `redirect()`'s thrown
  // control-flow error must never be swallowed by a catch here.
  let conversationId: string | null = null;

  try {
    const { data: listing } = await supabase
      .from("listings")
      .select("id, owner_id")
      .eq("id", listingId)
      .maybeSingle();

    // Listing not found, or (defense-in-depth backstop for spec §3.1 — the
    // button is already hidden for the listing's own owner, but a
    // hand-built call must still be rejected server-side) the caller is the
    // listing's own owner: fall through with no conversationId. This is a
    // plain `void` Server Action invoked as a form action (no
    // useActionState channel to surface a message through, unlike
    // createBookingRequest), so this backstop silently redirects back to
    // the listing page with no error copy — code-review-noted deviation
    // from spec §3.1 step 3's "reject with a friendly message" wording,
    // accepted as-is since the UI path is already unreachable and this is
    // a server-side-only safety net, not a real user-facing flow.
    if (listing && listing.owner_id !== user.id) {
      const { data: existing } = await supabase
        .from("conversations")
        .select("id")
        .eq("listing_id", listingId)
        .eq("owner_id", listing.owner_id)
        .eq("renter_id", user.id)
        .maybeSingle();

      conversationId = existing?.id ?? null;

      if (!conversationId) {
        const { data: inserted, error } = await supabase
          .from("conversations")
          .insert({
            listing_id: listingId,
            owner_id: listing.owner_id,
            renter_id: user.id,
          })
          .select("id")
          .single();

        if (error) {
          // The unique constraint (listing_id, owner_id, renter_id) is the
          // real race-safety net if two tabs double-submit (spec §3.1 step
          // 4): on a unique-violation, re-select and proceed rather than
          // erroring.
          if (error.code === "23505") {
            const { data: raced } = await supabase
              .from("conversations")
              .select("id")
              .eq("listing_id", listingId)
              .eq("owner_id", listing.owner_id)
              .eq("renter_id", user.id)
              .maybeSingle();
            conversationId = raced?.id ?? null;
          } else {
            console.error("startConversation: insert failed", error);
          }
        } else {
          conversationId = inserted.id;
        }
      }
    }
  } catch (err) {
    console.error("startConversation: unexpected error", err);
  }

  if (conversationId) {
    redirect(`/messages/${conversationId}`);
  }

  // No conversation to go to (listing missing, own-listing backstop, or an
  // unexpected failure above) — fall back to the listing page rather than
  // throwing an unhandled error at the user.
  redirect(`/listings/${listingId}`);
}

/**
 * Sends a message in an existing conversation (spec §4) — defense-in-depth,
 * not just RLS: independently re-verifies the caller is a participant
 * before inserting, same convention as approveBooking's independent
 * ownership re-check.
 */
export async function sendMessage(
  conversationId: string,
  formData: FormData,
): Promise<SendMessageState> {
  const supabase = await createClient();

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { status: "error", message: COPY.sessionExpired };
    }

    const { data: conversation } = await supabase
      .from("conversations")
      .select("id, owner_id, renter_id")
      .eq("id", conversationId)
      .maybeSingle();

    if (!conversation || (conversation.owner_id !== user.id && conversation.renter_id !== user.id)) {
      return { status: "error", message: COPY.noAccess };
    }

    const body = String(formData.get("body") ?? "").trim();
    if (!body) {
      return { status: "error", message: COPY.blankBody };
    }
    if (body.length > MAX_BODY_LENGTH) {
      return { status: "error", message: COPY.tooLong };
    }

    // Returns the inserted row (spec §3.3's "implementer's call on
    // optimistic-append vs. wait-for-realtime-echo" — this picks optimistic
    // append, using the server-assigned id/created_at so the client can
    // de-dupe against the realtime echo of this same row by id).
    const { data: inserted, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        body,
      })
      .select("id, body, created_at")
      .single();

    if (error || !inserted) {
      console.error("sendMessage: insert failed", error);
      return { status: "error", message: "Could not send your message. Please try again." };
    }

    revalidatePath(`/messages/${conversationId}`);
    revalidatePath("/messages");
    return { status: "success", data: inserted };
  } catch (err) {
    console.error("sendMessage: unexpected error", err);
    return { status: "error", message: "Could not send your message. Please try again." };
  }
}

/**
 * Marks the caller's own read cursor on a conversation as caught up to now
 * (spec §3.3 step 3 / §4). Independent participancy re-check, identical
 * shape to sendMessage's.
 *
 * Deliberately does NOT call `revalidatePath` (unlike every other mutation
 * in this file/codebase): every other Server Action here is invoked from a
 * Client Component in response to a user event, where `revalidatePath` is
 * paired with the caller's own `router.refresh()`/redirect to force an
 * already-rendered page to pick up fresh data. This action is unique in
 * being invoked directly from the `/messages/[id]` Server Component's own
 * render (spec §3.3 step 3), not from a client event — there is no
 * already-rendered page to invalidate, and calling a cache-revalidation
 * function mid-render (rather than from a Server Action's own top-level
 * request/response cycle triggered by a client) is untested territory in
 * this codebase, so it's avoided here rather than assumed safe. The inbox's
 * unread badge is computed fresh from the DB on every normal page
 * load/navigation regardless (spec §2.4) — no cache to invalidate for that
 * read path.
 */
export async function markConversationRead(conversationId: string): Promise<MessageActionState> {
  const supabase = await createClient();

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { status: "error", message: COPY.sessionExpired };
    }

    const { data: conversation } = await supabase
      .from("conversations")
      .select("id, owner_id, renter_id")
      .eq("id", conversationId)
      .maybeSingle();

    if (!conversation || (conversation.owner_id !== user.id && conversation.renter_id !== user.id)) {
      return { status: "error", message: COPY.noAccess };
    }

    const isOwner = conversation.owner_id === user.id;
    const { error } = await supabase
      .from("conversations")
      .update(isOwner ? { owner_last_read_at: new Date().toISOString() } : { renter_last_read_at: new Date().toISOString() })
      .eq("id", conversationId);

    if (error) {
      console.error("markConversationRead: update failed", error);
      return { status: "error", message: "Could not update read status." };
    }

    return { status: "success" };
  } catch (err) {
    console.error("markConversationRead: unexpected error", err);
    return { status: "error", message: "Could not update read status." };
  }
}

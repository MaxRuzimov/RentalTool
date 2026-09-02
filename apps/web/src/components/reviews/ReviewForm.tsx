"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import StarRating from "./StarRating";
import Spinner from "@/components/ui/Spinner";
import { createReview, type ReviewActionState } from "@/app/reviews/actions";

const PRIMARY_BUTTON =
  "flex h-10 items-center justify-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover active:bg-primary-active disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const MAX_COMMENT_LENGTH = 500;

/**
 * Inline "Rate this rental" form (spec §7.2) — toggled in place of the
 * "Leave a review" button by the parent `ReviewRowSlot`. Calls the
 * `createReview` server action and, on success, calls `router.refresh()`
 * (same pattern as `CancelBookingButton`) so the row re-renders in the
 * "already reviewed" state via fresh server props — no local success state
 * needed here.
 */
export default function ReviewForm({
  bookingId,
  onCancel,
}: {
  bookingId: string;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [state, setState] = useState<ReviewActionState>({ status: "idle" });

  async function handleSubmit() {
    if (rating < 1) {
      setState({ status: "error", message: "Please choose a star rating." });
      return;
    }

    setSubmitting(true);
    setState({ status: "idle" });

    const formData = new FormData();
    formData.set("rating", String(rating));
    formData.set("comment", comment);

    const result = await createReview(bookingId, formData);
    setSubmitting(false);

    if (result.status === "error") {
      setState(result);
      return;
    }

    router.refresh();
  }

  return (
    <div className="mt-2 rounded-2xl border border-line bg-surface p-4">
      <h3 className="text-sm font-semibold text-foreground">Rate this rental</h3>

      <div className="mt-2">
        <StarRating rating={rating} interactive onChange={setRating} size="md" />
      </div>

      <div className="mt-3 flex flex-col gap-1">
        <textarea
          rows={3}
          maxLength={MAX_COMMENT_LENGTH}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Optional — share how the rental went (max 500 characters)."
          className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-zinc-400 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 dark:placeholder:text-zinc-500"
        />
        <span className="self-end text-xs text-zinc-500 dark:text-zinc-400">
          {comment.length}/{MAX_COMMENT_LENGTH}
        </span>
      </div>

      {state.status === "error" && <p className="mt-1 text-sm text-danger">{state.message}</p>}

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || rating < 1}
          className={PRIMARY_BUTTON}
        >
          {submitting && <Spinner className="mr-2 h-4 w-4" />}
          {submitting ? "Submitting…" : "Submit review"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="text-sm font-medium text-accent underline-offset-2 hover:underline hover:text-accent-hover disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

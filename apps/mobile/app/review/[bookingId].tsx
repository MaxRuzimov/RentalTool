import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View, useColorScheme } from "react-native";
import PrimaryButton from "@/components/PrimaryButton";
import StarRating from "@/components/StarRating";
import { Colors, Radius, Spacing } from "@/constants/theme";
import { createReview } from "@/lib/reviews/actions";

const MAX_COMMENT_LENGTH = 500;

/**
 * Leave-a-review modal (spec §5.4.2) — presented as a modal screen, pushed
 * from the "Leave a review" button on a bookings/mine row, rather than
 * web's inline row-expand (see spec §5.4.2's justification). Same content
 * as apps/web/src/components/reviews/ReviewForm.tsx: interactive
 * StarRating with no default selection, optional comment capped at 500
 * chars with a live counter, Submit/Cancel pair.
 */
export default function ReviewModal() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? Colors.dark : Colors.light;

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (rating < 1) {
      setError("Please choose a star rating.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const result = await createReview(bookingId, rating, comment);
    setSubmitting(false);

    if (result.status === "error") {
      setError(result.message);
      return;
    }

    router.back();
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.container}>
        <Text style={[styles.heading, { color: colors.foreground }]}>Rate this rental</Text>

        <StarRating rating={rating} interactive onChange={setRating} size="md" />

        <View style={styles.commentBlock}>
          <TextInput
            multiline
            numberOfLines={4}
            maxLength={MAX_COMMENT_LENGTH}
            value={comment}
            onChangeText={setComment}
            placeholder="Optional — share how the rental went (max 500 characters)."
            placeholderTextColor={colors.muted}
            style={[styles.textarea, { borderColor: colors.border, color: colors.foreground }]}
          />
          <Text style={[styles.counter, { color: colors.muted }]}>
            {comment.length}/{MAX_COMMENT_LENGTH}
          </Text>
        </View>

        {error && <Text style={{ color: colors.error, fontSize: 14 }}>{error}</Text>}

        <View style={styles.actions}>
          <PrimaryButton
            title={submitting ? "Submitting…" : "Submit review"}
            onPress={handleSubmit}
            disabled={submitting || rating < 1}
            loading={submitting}
          />
          <Text
            style={{ color: colors.foreground, fontSize: 14, fontWeight: "500", textAlign: "center" }}
            onPress={submitting ? undefined : () => router.back()}
          >
            Cancel
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.xl, gap: Spacing.lg },
  heading: { fontSize: 18, fontWeight: "600" },
  commentBlock: { gap: Spacing.xs },
  textarea: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.input,
    padding: Spacing.md,
    fontSize: 14,
    minHeight: 90,
    textAlignVertical: "top",
  },
  counter: { fontSize: 12, alignSelf: "flex-end" },
  actions: { gap: Spacing.md },
});

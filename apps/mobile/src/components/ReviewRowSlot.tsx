import { useRouter } from "expo-router";
import { Text, View, useColorScheme } from "react-native";
import StarRating from "@/components/StarRating";
import { Colors, Spacing } from "@/constants/theme";

export type ExistingReview = { rating: number; comment: string | null };

/**
 * Review affordance on /bookings/mine rows (spec §5.4 state 3/4) — port of
 * apps/web/src/components/reviews/ReviewRowSlot.tsx, except "Leave a
 * review" pushes the review modal route instead of expanding an inline
 * form in place (spec §5.4.2's mobile-specific deviation).
 */
export default function ReviewRowSlot({
  bookingId,
  eligible,
  review,
}: {
  bookingId: string;
  eligible: boolean;
  review: ExistingReview | null;
}) {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? Colors.dark : Colors.light;

  if (review) {
    return (
      <View style={{ gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
          <StarRating rating={review.rating} size="sm" />
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "500" }}>Your review</Text>
        </View>
        {review.comment && <Text style={{ color: colors.foreground, fontSize: 14 }}>{review.comment}</Text>}
      </View>
    );
  }

  if (!eligible) {
    return null;
  }

  return (
    <Text
      style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}
      onPress={() => router.push({ pathname: "/review/[bookingId]", params: { bookingId } })}
    >
      Leave a review
    </Text>
  );
}

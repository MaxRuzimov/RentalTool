import { StyleSheet, Text, View, useColorScheme } from "react-native";
import StarRating from "@/components/StarRating";
import { Colors, Radius, Spacing } from "@/constants/theme";
import { TARGET_MARKET_TIME_ZONE } from "@/lib/bookings/pricing";

const MONTH_DAY_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: TARGET_MARKET_TIME_ZONE,
});

export type ReviewListItem = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  reviewerName: string | null;
};

function displayName(fullName: string | null): string {
  if (!fullName) return "A renter";
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const lastInitial = parts[parts.length - 1][0];
  return `${first} ${lastInitial}.`;
}

/** Port of apps/web/src/components/reviews/ReviewsList.tsx (spec §5.3/§6.2). */
export default function ReviewsList({ reviews }: { reviews: ReviewListItem[] }) {
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? Colors.dark : Colors.light;

  return (
    <View style={{ gap: Spacing.md }}>
      <Text style={[styles.heading, { color: colors.foreground }]}>
        {reviews.length > 0 ? `Reviews (${reviews.length})` : "Reviews"}
      </Text>

      {reviews.length === 0 ? (
        <Text style={{ color: colors.muted, fontSize: 14 }}>
          No reviews yet — be the first to rent this and leave one.
        </Text>
      ) : (
        <View style={{ gap: Spacing.md }}>
          {reviews.map((review) => (
            <View key={review.id} style={[styles.row, { borderColor: colors.border }]}>
              <View style={styles.rowHeader}>
                <StarRating rating={review.rating} size="sm" />
                <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "500" }}>
                  {displayName(review.reviewerName)}
                </Text>
                <Text style={{ color: colors.muted }}>·</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {MONTH_DAY_YEAR.format(new Date(review.createdAt))}
                </Text>
              </View>
              {review.comment && (
                <Text style={{ color: colors.foreground, fontSize: 14, marginTop: Spacing.xs }}>
                  {review.comment}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 18, fontWeight: "600" },
  row: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.card,
    padding: Spacing.lg,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
});

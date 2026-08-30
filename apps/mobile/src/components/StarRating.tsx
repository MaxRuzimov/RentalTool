import { Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import { StarColors } from "@/constants/theme";

/**
 * Port of apps/web/src/components/reviews/StarRating.tsx (spec §6.3) — five
 * Unicode glyphs (★ filled / ☆ empty), no icon library/SVG. Read-only mode:
 * filled count = Math.round(rating). Interactive mode (review form only):
 * Pressable-wrapped glyphs, onPress(n) reports 1-5, no pre-selected value.
 */
export default function StarRating({
  rating,
  interactive = false,
  onChange,
  size = "md",
}: {
  rating: number;
  interactive?: boolean;
  onChange?: (value: number) => void;
  size?: "sm" | "md";
}) {
  const scheme = useColorScheme();
  const emptyColor = scheme === "dark" ? StarColors.emptyDark : StarColors.emptyLight;
  const filledCount = Math.round(rating);
  const fontSize = size === "sm" ? 16 : 20;
  const stars = [1, 2, 3, 4, 5];

  return (
    <View style={styles.row} accessibilityLabel={`${rating} out of 5 stars`}>
      {stars.map((n) => {
        const filled = n <= filledCount;
        const glyph = filled ? "★" : "☆";
        const color = filled ? StarColors.filled : emptyColor;

        if (interactive) {
          return (
            <Pressable
              key={n}
              onPress={() => onChange?.(n)}
              hitSlop={6}
              accessibilityLabel={`Rate ${n} star${n === 1 ? "" : "s"}`}
            >
              <Text style={[styles.glyph, { color, fontSize }]}>{glyph}</Text>
            </Pressable>
          );
        }

        return (
          <Text key={n} style={[styles.glyph, { color, fontSize }]}>
            {glyph}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 2,
  },
  glyph: {
    lineHeight: 22,
  },
});

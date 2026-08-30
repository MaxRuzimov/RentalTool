import { StyleSheet, Text, View, type StyleProp, type ViewStyle, useColorScheme } from "react-native";
import { PlaceholderColors } from "@/constants/theme";

/**
 * Port of apps/web/src/components/listings/ImagePlaceholder.tsx (spec
 * §6.4): a plain gray box with the listing's first letter — no stock photo,
 * no external placeholder-image service.
 */
export default function ImagePlaceholder({
  label,
  style,
}: {
  label: string;
  style?: StyleProp<ViewStyle>;
}) {
  const scheme = useColorScheme();
  const initial = label.trim().charAt(0).toUpperCase() || "?";
  const bg = scheme === "dark" ? PlaceholderColors.bgDark : PlaceholderColors.bgLight;
  const text = scheme === "dark" ? PlaceholderColors.textDark : PlaceholderColors.textLight;

  return (
    <View style={[styles.container, { backgroundColor: bg }, style]}>
      <Text style={[styles.letter, { color: text }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  letter: {
    fontSize: 24,
    fontWeight: "600",
  },
});

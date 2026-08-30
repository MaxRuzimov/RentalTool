import { StyleSheet, Text, View, useColorScheme } from "react-native";
import { Radius, StatusColors } from "@/constants/theme";

/**
 * Booking status pill — port of apps/web/src/components/bookings/
 * StatusBadge.tsx (spec §6.1). Background/text only, no icons.
 */
export default function StatusBadge({ status }: { status: string }) {
  const scheme = useColorScheme();
  const style = StatusColors[status] ?? {
    bg: "#f4f4f5",
    bgDark: "#27272a",
    text: "#52525b",
    textDark: "#a1a1aa",
    label: status,
  };
  const bg = scheme === "dark" ? style.bgDark : style.bg;
  const text = scheme === "dark" ? style.textDark : style.text;

  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.label, { color: text }]}>{style.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  label: {
    fontSize: 12,
    fontWeight: "500",
  },
});

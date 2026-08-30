import { useRouter } from "expo-router";
import { StyleSheet, Text, View, useColorScheme } from "react-native";
import { Colors, Spacing } from "@/constants/theme";

/**
 * Segmented sub-nav shared by /bookings/mine and /bookings/owner-requests
 * (spec §2.3) — the current route renders bold/non-interactive, the other
 * navigates via `router.replace()` so switching back and forth doesn't grow
 * the back-stack.
 */
export default function BookingsSegmentedNav({ active }: { active: "mine" | "owner-requests" }) {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? Colors.dark : Colors.light;

  return (
    <View style={styles.row}>
      <Text
        style={{
          color: colors.foreground,
          fontSize: 14,
          fontWeight: active === "mine" ? "700" : "500",
          textDecorationLine: active === "mine" ? "none" : "underline",
        }}
        onPress={active === "mine" ? undefined : () => router.replace("/bookings/mine")}
      >
        My requests
      </Text>
      <Text style={{ color: colors.muted }}>·</Text>
      <Text
        style={{
          color: colors.foreground,
          fontSize: 14,
          fontWeight: active === "owner-requests" ? "700" : "500",
          textDecorationLine: active === "owner-requests" ? "none" : "underline",
        }}
        onPress={active === "owner-requests" ? undefined : () => router.replace("/bookings/owner-requests")}
      >
        Requests to me
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
});

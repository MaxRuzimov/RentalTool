import { useRouter } from "expo-router";
import { StyleSheet, Text, View, useColorScheme } from "react-native";
import PrimaryButton from "@/components/PrimaryButton";
import { Colors, Spacing } from "@/constants/theme";

/**
 * Whole-tab logged-out gate (spec §3.1) — used by Bookings and Profile.
 * Keeping all three tabs always tappable (rather than hiding them when
 * logged out) is simpler and lets a curious logged-out visitor discover the
 * feature and be routed straight into signing up.
 */
export default function LoggedOutGate({ message }: { message: string }) {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? Colors.dark : Colors.light;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.message, { color: colors.foreground }]}>{message}</Text>
      <View style={styles.actions}>
        <PrimaryButton title="Log in" onPress={() => router.push("/login")} />
        <Text
          style={{ color: colors.foreground, fontSize: 14, fontWeight: "600", textAlign: "center" }}
          onPress={() => router.push("/signup")}
        >
          Sign up
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
    gap: Spacing.lg,
  },
  message: {
    fontSize: 16,
    textAlign: "center",
  },
  actions: {
    width: "100%",
    maxWidth: 280,
    gap: Spacing.md,
  },
});

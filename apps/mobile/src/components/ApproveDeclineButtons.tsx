import { useState } from "react";
import { Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import { Colors, Radius, Spacing } from "@/constants/theme";
import { approveBooking, declineBooking } from "@/lib/bookings/actions";

/**
 * Approve/Decline actions on a pending row (spec §5.4.1) — no confirmation
 * dialog on either (both easily correctable). The inline error surfaces a
 * checkpoint-2 overlap conflict directly under the row.
 */
export default function ApproveDeclineButtons({ bookingId, onDone }: { bookingId: string; onDone: () => void }) {
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? Colors.dark : Colors.light;
  const bg = scheme === "dark" ? "#ededed" : "#171717";
  const text = scheme === "dark" ? "#0a0a0a" : "#ffffff";

  const [pending, setPending] = useState<"approve" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setPending("approve");
    setError(null);
    const result = await approveBooking(bookingId);
    setPending(null);
    if (result.status === "error") {
      setError(result.message);
      return;
    }
    onDone();
  }

  async function handleDecline() {
    setPending("decline");
    setError(null);
    const result = await declineBooking(bookingId);
    setPending(null);
    if (result.status === "error") {
      setError(result.message);
      return;
    }
    onDone();
  }

  return (
    <View style={{ gap: Spacing.sm, alignItems: "flex-end" }}>
      <View style={styles.row}>
        <Pressable
          onPress={handleApprove}
          disabled={pending !== null}
          style={[styles.button, { backgroundColor: bg, opacity: pending !== null ? 0.5 : 1 }]}
        >
          <Text style={{ color: text, fontSize: 13, fontWeight: "600" }}>
            {pending === "approve" ? "Approving…" : "Approve"}
          </Text>
        </Pressable>
        <Pressable
          onPress={handleDecline}
          disabled={pending !== null}
          style={[styles.button, styles.declineButton, { borderColor: colors.error, opacity: pending !== null ? 0.5 : 1 }]}
        >
          <Text style={{ color: colors.error, fontSize: 13, fontWeight: "600" }}>
            {pending === "decline" ? "Declining…" : "Decline"}
          </Text>
        </Pressable>
      </View>
      {error && <Text style={{ color: colors.error, fontSize: 12, textAlign: "right" }}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: Spacing.sm },
  button: {
    height: 36,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  declineButton: {
    backgroundColor: "transparent",
    borderWidth: StyleSheet.hairlineWidth,
  },
});

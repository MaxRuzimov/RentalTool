import { useState } from "react";
import { Alert, StyleSheet, Text, useColorScheme } from "react-native";
import { Colors } from "@/constants/theme";
import { cancelBooking } from "@/lib/bookings/actions";

/**
 * "Cancel request" button (spec §5.4/§5.4.1, exact copy §11) — shared by
 * /bookings/mine and /bookings/owner-requests. `Alert.alert()` is the RN
 * equivalent of web's `confirm()` (spec §8).
 */
export default function CancelBookingButton({ bookingId, onDone }: { bookingId: string; onDone: () => void }) {
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? Colors.dark : Colors.light;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handlePress() {
    Alert.alert("Cancel this booking request?", "This cannot be undone.", [
      { text: "Never mind", style: "cancel" },
      { text: "Cancel request", style: "destructive", onPress: doCancel },
    ]);
  }

  async function doCancel() {
    setPending(true);
    setError(null);
    const result = await cancelBooking(bookingId);
    setPending(false);

    if (result.status === "error") {
      setError(result.message);
      return;
    }
    onDone();
  }

  return (
    <>
      <Text
        onPress={pending ? undefined : handlePress}
        style={[styles.link, { color: colors.error, opacity: pending ? 0.5 : 1 }]}
      >
        {pending ? "Cancelling…" : "Cancel request"}
      </Text>
      {error && <Text style={{ color: colors.error, fontSize: 12 }}>{error}</Text>}
    </>
  );
}

const styles = StyleSheet.create({
  link: { fontSize: 14, fontWeight: "500" },
});

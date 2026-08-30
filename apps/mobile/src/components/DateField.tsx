import { useState } from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Modal, Platform, Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import { Colors, Radius, Spacing } from "@/constants/theme";
import { formatDateRange } from "@/lib/bookings/pricing";
import { isoDateToLocalDate, localDateToISODate } from "@/lib/dateUtils";

/**
 * Tappable date field opening the native date picker on tap (spec §5.3.1) —
 * `@react-native-community/datetimepicker`, the RN-appropriate equivalent
 * of web's native `<input type="date">`. Two tappable fields showing the
 * currently selected date (e.g. "Aug 12, 2026"), not always-visible inline
 * calendars, to conserve vertical space.
 */
export default function DateField({
  label,
  value,
  minValue,
  onChange,
}: {
  label: string;
  value: string;
  minValue: string;
  onChange: (isoDate: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? Colors.dark : Colors.light;

  function handleChange(event: { type: string }, date?: Date) {
    if (Platform.OS === "android") {
      setOpen(false);
    }
    if (event.type === "set" && date) {
      onChange(localDateToISODate(date));
    }
  }

  const picker = (
    <DateTimePicker
      value={isoDateToLocalDate(value)}
      mode="date"
      display={Platform.OS === "ios" ? "spinner" : "default"}
      minimumDate={isoDateToLocalDate(minValue)}
      onChange={handleChange}
    />
  );

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.field, { borderColor: colors.border }]}
      >
        <Text style={{ color: colors.foreground, fontSize: 14 }}>{formatDateRange(value, value)}</Text>
      </Pressable>

      {open && Platform.OS === "android" && picker}

      {open && Platform.OS === "ios" && (
        <Modal transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
            <View />
          </Pressable>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            {picker}
            <Pressable style={styles.doneButton} onPress={() => setOpen(false)}>
              <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 15 }}>Done</Text>
            </Pressable>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, gap: Spacing.xs },
  label: { fontSize: 14, fontWeight: "500" },
  field: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.input,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)" },
  sheet: {
    borderTopLeftRadius: Radius.card,
    borderTopRightRadius: Radius.card,
    paddingBottom: Spacing.xl,
  },
  doneButton: {
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
});

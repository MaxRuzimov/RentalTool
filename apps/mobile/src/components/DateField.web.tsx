import { createElement } from "react";
import { StyleSheet, Text, View, useColorScheme } from "react-native";
import { Colors, Radius, Spacing } from "@/constants/theme";

/**
 * Web-platform variant of DateField (Metro/Expo automatically picks this
 * file over DateField.tsx when bundling for the web target — same
 * `.web.tsx` convention already used by `use-color-scheme.web.ts`).
 *
 * `@react-native-community/datetimepicker` has no web implementation (its
 * base component renders nothing on `Platform.OS === "web"`), so the
 * primary DateField.tsx's native iOS/Android picker is inert here — found
 * during M9's cross-platform QA pass, where it blocked date-range selection
 * entirely when testing via `expo start --web` (this repo's only available
 * mobile-testing surface, since no native simulator exists in this
 * environment). Real end users reach the native picker on an iOS/Android
 * build; this file exists purely so the web target — the way this team
 * exercises the mobile app before a device/simulator is available — has a
 * working equivalent instead of a silently-dead tap target.
 *
 * A plain native `<input type="date">`, same choice and reasoning already
 * used by apps/web's own RequestToRentForm (docs/design/m5-booking-spec.md
 * §3.2) — no calendar-grid widget, zero new dependency. `value`/`minValue`
 * are already plain `YYYY-MM-DD` strings (see src/lib/dateUtils.ts), the
 * exact format a date input's `value`/`min` attributes and `onChange`
 * event both use natively, so no conversion is needed here.
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
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? Colors.dark : Colors.light;

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      {createElement("input", {
        type: "date",
        value,
        min: minValue,
        onChange: (e: { target: { value: string } }) => {
          if (e.target.value) onChange(e.target.value);
        },
        style: {
          borderWidth: 1,
          borderStyle: "solid",
          borderColor: colors.border,
          borderRadius: Radius.input,
          paddingLeft: Spacing.md,
          paddingRight: Spacing.md,
          paddingTop: Spacing.sm + 2,
          paddingBottom: Spacing.sm + 2,
          color: colors.foreground,
          backgroundColor: "transparent",
          fontSize: 14,
          fontFamily: "inherit",
        },
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, gap: Spacing.xs },
  label: { fontSize: 14, fontWeight: "500" },
});

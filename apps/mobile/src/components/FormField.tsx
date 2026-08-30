import { StyleSheet, Text, TextInput, View, type TextInputProps, useColorScheme } from "react-native";
import { Colors, Radius, Spacing } from "@/constants/theme";

/** Shared labeled text input, used across Login/Signup/Profile/booking forms. */
export default function FormField({
  label,
  helperText,
  helperIsError,
  ...inputProps
}: TextInputProps & { label?: string; helperText?: string; helperIsError?: boolean }) {
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? Colors.dark : Colors.light;

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.muted}
        style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
        {...inputProps}
      />
      {helperText ? (
        <Text style={[styles.helper, { color: helperIsError ? colors.error : colors.muted }]}>
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.xs,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.input,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    fontSize: 14,
  },
  helper: {
    fontSize: 12,
  },
});

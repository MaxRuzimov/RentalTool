import { ActivityIndicator, Pressable, StyleSheet, Text, useColorScheme } from "react-native";
import { Radius } from "@/constants/theme";

/**
 * Shared primary-action button style — RN translation of web's repeated
 * "solid dark-on-light in light mode, light-on-dark in dark mode" pill
 * button class (spec §7.1).
 */
export default function PrimaryButton({
  title,
  onPress,
  disabled,
  loading,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const scheme = useColorScheme();
  const bg = scheme === "dark" ? "#ededed" : "#171717";
  const text = scheme === "dark" ? "#0a0a0a" : "#ffffff";
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={[styles.button, { backgroundColor: bg, opacity: isDisabled ? 0.5 : 1 }]}
    >
      {loading ? <ActivityIndicator color={text} /> : <Text style={[styles.label, { color: text }]}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 44,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
  },
});

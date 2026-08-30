import { useColorScheme } from "react-native";
import { Colors, type ThemeColors } from "@/constants/theme";

/** Resolves the token table in constants/theme.ts against the OS scheme. */
export function useThemeColors(): ThemeColors {
  const scheme = useColorScheme();
  return scheme === "dark" ? Colors.dark : Colors.light;
}

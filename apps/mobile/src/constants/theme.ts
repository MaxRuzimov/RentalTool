/**
 * Shared color/spacing tokens (spec docs/design/m8-mobile-spec.md §7),
 * translated from `apps/web/src/app/globals.css`'s Tailwind tokens into
 * plain RN `StyleSheet` values. Dark mode is driven by `useColorScheme()`
 * (OS setting only, no manual toggle — spec §7.1), same as web's
 * `prefers-color-scheme`-only approach.
 */
export type ThemeColors = {
  background: string;
  foreground: string;
  border: string;
  muted: string;
  error: string;
  success: string;
  cardBackground: string;
};

export const Colors: { light: ThemeColors; dark: ThemeColors } = {
  light: {
    background: "#ffffff",
    foreground: "#171717",
    border: "rgba(0,0,0,0.08)",
    muted: "#71717a",
    error: "#dc2626",
    success: "#16a34a",
    cardBackground: "#ffffff",
  },
  dark: {
    background: "#0a0a0a",
    foreground: "#ededed",
    border: "rgba(255,255,255,0.145)",
    muted: "#a1a1aa",
    error: "#dc2626",
    success: "#16a34a",
    cardBackground: "#0a0a0a",
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const Radius = {
  card: 16,
  input: 8,
  pill: 9999,
} as const;

// Status badge colors (spec §6.1) — light mode only per spec's table; dark
// mode follows the same tint pairing at reduced opacity, same spirit as
// web's `dark:bg-*-900/40` classes.
export const StatusColors: Record<string, { bg: string; bgDark: string; text: string; textDark: string; label: string }> = {
  pending: { bg: "#fef3c7", bgDark: "rgba(180,83,9,0.25)", text: "#92400e", textDark: "#fcd34d", label: "Pending" },
  approved: { bg: "#dcfce7", bgDark: "rgba(21,128,61,0.25)", text: "#166534", textDark: "#86efac", label: "Approved" },
  declined: { bg: "#fee2e2", bgDark: "rgba(185,28,28,0.25)", text: "#991b1b", textDark: "#fca5a5", label: "Declined" },
  cancelled: { bg: "#f4f4f5", bgDark: "#27272a", text: "#52525b", textDark: "#a1a1aa", label: "Cancelled" },
};

// Star colors (spec §6.3).
export const StarColors = {
  filled: "#f59e0b",
  emptyLight: "#d4d4d8",
  emptyDark: "#52525b",
};

// Image-placeholder colors (spec §6.4).
export const PlaceholderColors = {
  bgLight: "#f4f4f5",
  bgDark: "#18181b",
  textLight: "#a1a1aa",
  textDark: "#52525b",
};

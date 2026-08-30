import { Tabs } from "expo-router";
import { Text, useColorScheme } from "react-native";
import { Colors } from "@/constants/theme";

/**
 * Bottom tab bar (spec §2.1) — three tabs: Browse, Bookings, Profile. Each
 * is its own nested stack (Expo Router's standard `(tabs)` group behavior),
 * so pushing a detail/sub-screen from a tab keeps that tab's back-stack
 * independent of the others. Plain Unicode/emoji glyphs for icons — same
 * "no icon library" spirit as StarRating/StatusBadge, not a product
 * decision worth a dependency.
 */
export default function TabsLayout() {
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? Colors.dark : Colors.light;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.foreground,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen
        name="browse"
        options={{
          title: "Browse",
          tabBarIcon: ({ size }) => <Text style={{ fontSize: size }}>🔍</Text>,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: "Bookings",
          tabBarIcon: ({ size }) => <Text style={{ fontSize: size }}>📋</Text>,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ size }) => <Text style={{ fontSize: size }}>👤</Text>,
        }}
      />
    </Tabs>
  );
}

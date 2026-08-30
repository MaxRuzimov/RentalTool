import { Stack, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, Text, View, useColorScheme } from "react-native";
import { AuthProvider, useAuth } from "@/lib/auth/AuthProvider";
import { Colors } from "@/constants/theme";

/**
 * Session bootstrap (spec §3.3): while `getSession()` is resolving from
 * AsyncStorage, render a minimal centered `ActivityIndicator` over the root
 * layout instead of the tab bar / gate screens — the one loading state this
 * spec introduces with no web-page analog.
 */
function RootNavigator() {
  const { loading } = useAuth();
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? Colors.dark : Colors.light;

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="login"
        options={{
          presentation: "modal",
          headerShown: true,
          title: "",
          headerLeft: () => <CancelHeaderButton />,
        }}
      />
      <Stack.Screen
        name="signup"
        options={{
          presentation: "modal",
          headerShown: true,
          title: "",
          headerLeft: () => <CancelHeaderButton />,
        }}
      />
      <Stack.Screen
        name="review/[bookingId]"
        options={{
          presentation: "modal",
          headerShown: true,
          title: "Rate this rental",
        }}
      />
    </Stack>
  );
}

function CancelHeaderButton() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? Colors.dark : Colors.light;
  return (
    <Pressable onPress={() => router.back()} hitSlop={8}>
      <Text style={{ color: colors.foreground, fontSize: 15 }}>Cancel</Text>
    </Pressable>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

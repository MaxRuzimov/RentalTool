import { Stack } from "expo-router";

/**
 * Bookings tab's stack (spec §2.3): two distinct routes, `mine` (the tab's
 * default landing route regardless of whether the user owns any listings)
 * and `owner-requests` — not one screen with an internal toggle. Each
 * screen renders its own segmented sub-nav + heading, so the native header
 * is hidden here.
 */
export default function BookingsLayout() {
  return (
    <Stack initialRouteName="mine" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="mine" />
      <Stack.Screen name="owner-requests" />
    </Stack>
  );
}

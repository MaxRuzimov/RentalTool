import { Redirect } from "expo-router";

/**
 * `app/(tabs)/browse/index.tsx`'s actual route is `/browse` (a folder, not
 * an `index.tsx` directly under `(tabs)`), so a bare app launch (which
 * resolves to `/`) needs an explicit redirect into the Browse tab — the
 * app's default landing screen (spec §2.1/§3.1: Browse is fully usable
 * logged out and is the first tab).
 */
export default function Index() {
  return <Redirect href="/browse" />;
}

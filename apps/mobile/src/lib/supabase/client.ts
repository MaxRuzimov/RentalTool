import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

/**
 * Single module-scoped Supabase client (spec §1.2) — unlike web's
 * "create a new client per call site" convention (apps/web/src/lib/supabase/
 * client.ts), which exists specifically to handle web's split server/browser
 * cookie-reading call sites. A mobile app has exactly one runtime context, so
 * a singleton is the normal, simplest pattern and avoids re-creating the
 * AsyncStorage-backed session listener repeatedly.
 *
 * `EXPO_PUBLIC_`-prefixed env vars are inlined directly into the bundle by
 * Expo's bundler at build time (see app.config.ts, which also re-exposes
 * them under `extra` so a missing value fails fast at config-eval time).
 */
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. " +
      "Create apps/mobile/.env.local pointing at your local `supabase start` instance.",
  );
}

// Session persistence via AsyncStorage (spec §1.2) — lets a session survive
// an app restart; Supabase's client handles token refresh/rotation on its
// own once given a storage adapter, nothing custom needed here.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

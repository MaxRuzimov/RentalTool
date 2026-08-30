import type { ExpoConfig } from "expo/config";

// M8 spec §9: reads EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY
// from apps/mobile/.env.local (gitignored, same convention as
// apps/web/.env.local). Expo's `EXPO_PUBLIC_`-prefix env vars are
// automatically loaded from `.env.local` and inlined into the client bundle
// at build time (no extra dotenv wiring needed) — the app code below also
// reads `process.env.EXPO_PUBLIC_*` directly (see src/lib/supabase/client.ts)
// for the same reason; they're re-exposed under `extra` here too so a
// missing value fails fast at config-eval time (`expo start` / `expo build`)
// rather than only surfacing once the Supabase client tries to make a
// request.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    "[app.config.ts] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are not set. " +
      "Copy apps/mobile/.env.local.example (or the root .env.example) to apps/mobile/.env.local " +
      "and point it at your local `supabase start` instance.",
  );
}

const config: ExpoConfig = {
  name: "mobile",
  slug: "mobile",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "mobile",
  userInterfaceStyle: "automatic",
  ios: {
    supportsTablet: true,
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#ffffff",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
  },
  web: {
    // "single" (client-only SPA), not "static" (SSG/SSR): this app has no
    // server-rendering story of its own (the session lives in
    // AsyncStorage, which doesn't exist in a Node SSR pass — see the RN
    // Supabase client in src/lib/supabase/client.ts). Web is a smoke-test
    // convenience target for this milestone (spec §5, native is the real
    // target platform), not a server-rendered web app.
    output: "single",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "@react-native-community/datetimepicker",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#ffffff",
        image: "./assets/images/splash-icon.png",
        imageWidth: 120,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    supabaseUrl,
    supabaseAnonKey,
  },
};

export default config;

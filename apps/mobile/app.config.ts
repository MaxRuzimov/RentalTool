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
    // M11: Apple submission is deferred (Google Play only for now), but set
    // this now anyway — cheap to add, and it keeps EAS config validation
    // happy for both platforms. Matches the Android package below; not used
    // for any real iOS build/submit work in M11.
    bundleIdentifier: "com.rentaltool.app",
  },
  android: {
    // M11: Google Play requires a permanent reverse-domain application ID
    // that CANNOT be changed after the app's first published release (Play
    // Console treats it as the app's permanent identity — a rename means
    // publishing as a brand-new, zero-install-history app). Not previously
    // set anywhere in this repo (verified via `git log -p` on this file and
    // a repo-wide grep for "com.rentaltool" — no prior/reserved value
    // exists). "com.rentaltool.app" was chosen as the obvious
    // reverse-domain form of this product's name; flagged prominently here
    // and in the M11 handoff report for a stakeholder sanity-check before
    // this is ever actually published, precisely because it's irreversible.
    package: "com.rentaltool.app",
    // Android versionCode: intentionally NOT hand-set here. eas.json's
    // `cli.appVersionSource: "remote"` + the `production` build profile's
    // `autoIncrement: true` let EAS itself track and bump the versionCode
    // per build on EAS's servers — this is the current EAS/Expo SDK 57
    // convention (`eas.json` docs, "Remote version source") and is the
    // more standard, less error-prone option vs. hand-maintaining a
    // `versionCode` integer in this file (which is easy to forget to bump
    // before a build and has caused real Play Console "version code
    // already used" rejections industry-wide). If EAS's remote versioning
    // is ever abandoned in favor of local versioning, set
    // `android.versionCode: 1` here as the starting value and bump by hand
    // per release.
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

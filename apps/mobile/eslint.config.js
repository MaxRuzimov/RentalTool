// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // eslint-config-expo pulls in eslint-plugin-react-hooks v7's React
    // Compiler-oriented rules, including `set-state-in-effect`, which flags
    // the standard "fetch on mount / on a dependency change, track a
    // loading flag" useEffect pattern used throughout this app's
    // data-fetching screens (M8 spec §8's "every data-fetching screen shows
    // a centered ActivityIndicator while its initial fetch is in flight").
    // This app does not opt into the React Compiler (see app.config.ts —
    // `experiments.reactCompiler` is not set), so the rule's premise
    // (automatic re-memoization making this pattern unsafe) doesn't apply
    // here; it would otherwise force every screen onto a data-fetching
    // library, which is out of scope for this milestone. Disabled with this
    // explanation rather than silently reformatted per-file.
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

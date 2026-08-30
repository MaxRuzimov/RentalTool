import { useState } from "react";
import { useRouter } from "expo-router";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import FormField from "@/components/FormField";
import PrimaryButton from "@/components/PrimaryButton";
import { Colors, Spacing } from "@/constants/theme";
import { supabase } from "@/lib/supabase/client";

/**
 * Direct field-for-field port of M2 §3 / spec §5.1 — same fields, same
 * client-side validation, same error-copy mapping. On success, dismisses
 * per §2.4/§3.2 (`router.back()`, falling back to the Browse tab if there's
 * no back target — e.g. the app cold-started directly into a logged-out
 * gate).
 */
export default function LoginScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? Colors.dark : Colors.light;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);

    if (signInError) {
      console.error(signInError);
      if (signInError.message.toLowerCase().includes("invalid login credentials")) {
        setError("Invalid email or password.");
      } else {
        setError("Something went wrong. Please try again.");
      }
      return;
    }

    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/browse");
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={[styles.title, { color: colors.foreground }]}>Log in</Text>

        <View style={styles.form}>
          <FormField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={styles.passwordRow}>
            <Text style={[styles.label, { color: colors.foreground }]}>Password</Text>
            <Text style={[styles.forgot, { color: colors.muted }]}>Forgot password? (coming soon)</Text>
          </View>
          <FormField value={password} onChangeText={setPassword} secureTextEntry />

          {error && <Text style={[styles.error, { color: colors.error }]}>{error}</Text>}

          <PrimaryButton
            title={submitting ? "Logging in…" : "Log in"}
            onPress={handleSubmit}
            disabled={submitting}
            loading={submitting}
          />
        </View>

        <View style={styles.footer}>
          <Text style={{ color: colors.muted, fontSize: 14 }}>Don&apos;t have an account? </Text>
          <Text
            style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}
            onPress={() => router.replace("/signup")}
          >
            Sign up
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.xl,
    gap: Spacing.lg,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
  },
  form: {
    gap: Spacing.lg,
  },
  passwordRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: -Spacing.sm,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
  },
  forgot: {
    fontSize: 12,
  },
  error: {
    fontSize: 14,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: Spacing.lg,
  },
});

import { useState } from "react";
import { useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, useColorScheme } from "react-native";
import FormField from "@/components/FormField";
import PrimaryButton from "@/components/PrimaryButton";
import { Colors, Spacing } from "@/constants/theme";
import { supabase } from "@/lib/supabase/client";

/**
 * Direct field-for-field port of M2 §2 / spec §5.1. Same
 * signUp()-returns-no-session-when-confirmations-are-enabled handling as
 * web (spec's local dev instance has confirmations disabled, so this
 * branch is mostly exercised against a hosted project).
 */
export default function SignupScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? Colors.dark : Colors.light;

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationPending, setConfirmationPending] = useState(false);

  const passwordsMismatch = confirmTouched && confirmPassword.length > 0 && confirmPassword !== password;

  async function handleSubmit() {
    setError(null);

    const trimmedFullName = fullName.trim();
    if (!trimmedFullName) {
      setError("Please enter your full name.");
      return;
    }
    if (password !== confirmPassword) {
      setConfirmTouched(true);
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: trimmedFullName } },
    });
    setSubmitting(false);

    if (signUpError) {
      console.error(signUpError);
      const message = signUpError.message.toLowerCase();
      if (message.includes("already registered") || message.includes("already exists")) {
        setError("An account with this email already exists. Try logging in instead.");
      } else if (message.includes("password")) {
        setError("Password must be at least 6 characters.");
      } else {
        setError("Something went wrong. Please try again.");
      }
      return;
    }

    if (data.session) {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/(tabs)/browse");
      }
      return;
    }

    setConfirmationPending(true);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={[styles.title, { color: colors.foreground }]}>Sign up</Text>

        {confirmationPending ? (
          <Text style={{ color: colors.success, fontSize: 14 }}>
            Account created! Check your email to confirm your account, then log in.
          </Text>
        ) : (
          <View style={styles.form}>
            <FormField label="Full name" value={fullName} onChangeText={setFullName} placeholder="Your full name" />
            <FormField
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <FormField
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              helperText="At least 6 characters."
            />
            <FormField
              label="Confirm password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              onBlur={() => setConfirmTouched(true)}
              secureTextEntry
              helperText={passwordsMismatch ? "Passwords do not match." : undefined}
              helperIsError
            />

            {error && <Text style={{ color: colors.error, fontSize: 14 }}>{error}</Text>}

            <PrimaryButton
              title={submitting ? "Signing up…" : "Sign up"}
              onPress={handleSubmit}
              disabled={submitting}
              loading={submitting}
            />
          </View>
        )}

        <View style={styles.footer}>
          <Text style={{ color: colors.muted, fontSize: 14 }}>Already have an account? </Text>
          <Text
            style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}
            onPress={() => router.replace("/login")}
          >
            Log in
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
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: Spacing.lg,
  },
});

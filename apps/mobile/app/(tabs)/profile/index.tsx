import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import FormField from "@/components/FormField";
import LoggedOutGate from "@/components/LoggedOutGate";
import PrimaryButton from "@/components/PrimaryButton";
import { useAuth } from "@/lib/auth/AuthProvider";
import { supabase } from "@/lib/supabase/client";
import { Colors, Spacing } from "@/constants/theme";

/**
 * Profile (spec §5.5) — direct port of M2 §4: always-editable form (no
 * view/edit toggle), same fields/copy as apps/web/src/app/profile/
 * ProfileForm.tsx. Log out sits at the bottom (no persistent header nav on
 * mobile to hold it).
 */
export default function ProfileScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? Colors.dark : Colors.light;

  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!user) {
        setLoading(false);
        return;
      }
      let mounted = true;
      setLoading(true);
      supabase
        .from("profiles")
        .select("full_name, avatar_url, phone, city")
        .eq("id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (!mounted) return;
          setFullName(data?.full_name ?? "");
          setAvatarUrl(data?.avatar_url ?? "");
          setPhone(data?.phone ?? "");
          setCity(data?.city ?? "");
          setLoading(false);
        });
      return () => {
        mounted = false;
      };
    }, [user]),
  );

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setError(null);
    setSaved(false);

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim() || null,
        avatar_url: avatarUrl.trim() || null,
        phone: phone.trim() || null,
        city: city.trim() || null,
      })
      .eq("id", user.id);

    setSaving(false);

    if (updateError) {
      console.error(updateError);
      setError("Could not save changes. Please try again.");
      return;
    }

    setSaved(true);
  }

  async function handleLogOut() {
    await supabase.auth.signOut();
    router.replace("/(tabs)/browse");
  }

  if (authLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!user) {
    return <LoggedOutGate message="Log in to view your profile." />;
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={[styles.title, { color: colors.foreground }]}>Your profile</Text>
        <Text style={{ color: colors.muted, fontSize: 14 }}>Signed in as {user.email}</Text>

        <View style={styles.form}>
          <FormField label="Full name" value={fullName} onChangeText={setFullName} placeholder="Your full name" />

          <View style={{ gap: Spacing.xs }}>
            <FormField
              label="Avatar URL"
              value={avatarUrl}
              onChangeText={(v) => {
                setAvatarUrl(v);
                setAvatarBroken(false);
              }}
              placeholder="https://…"
              autoCapitalize="none"
              keyboardType="url"
            />
            {avatarUrl && !avatarBroken ? (
              <Image
                source={{ uri: avatarUrl }}
                style={[styles.avatar, { borderColor: colors.border }]}
                onError={() => setAvatarBroken(true)}
              />
            ) : null}
          </View>

          <FormField
            label="Phone"
            value={phone}
            onChangeText={setPhone}
            placeholder="(647) 555-0100"
            keyboardType="phone-pad"
            helperText="Only visible to you for now."
          />

          <FormField label="City" value={city} onChangeText={setCity} placeholder="e.g. Toronto" />

          {error && <Text style={{ color: colors.error, fontSize: 14 }}>{error}</Text>}
          {saved && !error && <Text style={{ color: colors.success, fontSize: 14 }}>Profile updated.</Text>}

          <PrimaryButton
            title={saving ? "Saving…" : "Save changes"}
            onPress={handleSave}
            disabled={saving}
            loading={saving}
          />
        </View>

        <View style={styles.logoutRow}>
          <Text
            style={{ color: colors.error, fontSize: 14, fontWeight: "600", textAlign: "center" }}
            onPress={handleLogOut}
          >
            Log out
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: Spacing.xl, gap: Spacing.lg },
  title: { fontSize: 22, fontWeight: "600" },
  form: { gap: Spacing.lg, marginTop: Spacing.sm },
  avatar: { width: 64, height: 64, borderRadius: 32, borderWidth: StyleSheet.hairlineWidth },
  logoutRow: { marginTop: Spacing.xl },
});

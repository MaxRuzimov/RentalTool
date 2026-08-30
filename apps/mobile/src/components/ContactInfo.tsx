import { Text, View, useColorScheme } from "react-native";
import { Colors } from "@/constants/theme";

/** Port of apps/web/src/components/bookings/ContactInfo.tsx (spec §5.4/§11). */
export default function ContactInfo({ fullName, phone }: { fullName: string | null; phone: string | null }) {
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? Colors.dark : Colors.light;
  const name = fullName || "the other party";

  return (
    <View style={{ gap: 2 }}>
      {phone ? (
        <Text style={{ color: colors.foreground, fontSize: 14 }}>
          Contact: {name}, {phone}
        </Text>
      ) : (
        <Text style={{ color: colors.foreground, fontSize: 14 }}>
          No phone number on file — contact via {name}&apos;s profile.
        </Text>
      )}
      <Text style={{ color: colors.muted, fontSize: 12 }}>Arrange pickup and payment directly.</Text>
    </View>
  );
}

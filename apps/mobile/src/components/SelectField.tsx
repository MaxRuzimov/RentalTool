import { useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import { Colors, Radius, Spacing } from "@/constants/theme";

export type SelectOption = { value: string; label: string };

/**
 * RN equivalent of a native `<select>` (spec §6.2) — a tappable field
 * showing the current selection (or a placeholder), opening a simple modal
 * list on tap. Not @react-native-picker/picker (inconsistent iOS/Android
 * rendering) and not a platform ActionSheet (two idioms to keep aligned) —
 * see spec §6.2 for the full rationale. No search/type-ahead, no
 * multi-select — unnecessary at this app's option-count scale.
 */
export default function SelectField({
  label,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  value: string | undefined;
  options: SelectOption[];
  placeholder: string;
  onChange: (value: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? Colors.dark : Colors.light;

  const selected = options.find((o) => o.value === value);

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.field, { borderColor: colors.border }]}
      >
        <Text style={{ color: selected ? colors.foreground : colors.muted, fontSize: 14 }}>
          {selected ? selected.label : placeholder}
        </Text>
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View />
        </Pressable>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{label}</Text>
          <FlatList
            data={[{ value: "", label: placeholder }, ...options]}
            keyExtractor={(item) => item.value || "__all__"}
            renderItem={({ item }) => {
              const isSelected = item.value === (value ?? "");
              return (
                <Pressable
                  style={styles.option}
                  onPress={() => {
                    onChange(item.value || undefined);
                    setOpen(false);
                  }}
                >
                  <Text
                    style={{
                      color: colors.foreground,
                      fontWeight: isSelected ? "600" : "400",
                      fontSize: 15,
                    }}
                  >
                    {isSelected ? "✓ " : ""}
                    {item.label}
                  </Text>
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.xs,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
  },
  field: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.input,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  sheet: {
    maxHeight: "60%",
    borderTopLeftRadius: Radius.card,
    borderTopRightRadius: Radius.card,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "600",
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  option: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
});

import { useMemo, useState } from "react";
import { FlatList, Modal, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";

export interface PickerOption {
  id: number | string;
  label: string;
  sublabel?: string;
}

interface Props {
  visible: boolean;
  title: string;
  options: PickerOption[];
  selectedId?: number | string | null;
  searchable?: boolean;
  allowClear?: boolean;
  onSelect: (id: number | string | null) => void;
  onClose: () => void;
}

// Generic single-select modal used everywhere a form needs to pick a category/location/user/etc —
// avoids a native <Picker> dependency (Expo's own is Android/iOS-styled very differently) in favor
// of one consistent look across every module. Renders as a bottom sheet capped at 80% of the
// screen (matching the pattern in GatesScreen/NetworkGraphScreen) so it sizes to the option list
// instead of always covering the full screen, even for a 2-3 option picker.
export function PickerModal({ visible, title, options, selectedId, searchable, allowClear, onSelect, onClose }: Props) {
  const { colors, spacing, radius } = useTheme();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#0008", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "80%", paddingBottom: spacing.lg }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {searchable && (
            <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.sm }}>
              <TextInput
                style={{ backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10, color: colors.text }}
                placeholder="Search..."
                placeholderTextColor={colors.textMuted}
                value={query}
                onChangeText={setQuery}
              />
            </View>
          )}

          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.id)}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: spacing.lg }}
            ListHeaderComponent={
              allowClear ? (
                <TouchableOpacity
                  style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}
                  onPress={() => {
                    onSelect(null);
                    onClose();
                  }}
                >
                  <Text style={{ color: colors.textMuted, fontStyle: "italic" }}>None</Text>
                </TouchableOpacity>
              ) : null
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}
                onPress={() => {
                  onSelect(item.id);
                  onClose();
                }}
              >
                <View>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>{item.label}</Text>
                  {item.sublabel && <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{item.sublabel}</Text>}
                </View>
                {selectedId === item.id && <Ionicons name="checkmark" size={18} color={colors.primary} />}
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 24, marginBottom: 24 }}>No results.</Text>}
          />
        </View>
      </View>
    </Modal>
  );
}

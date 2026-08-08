import { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { CustomColumn, useCustomColumns } from "../hooks/useCustomColumns";

const FIELD_TYPES: { value: CustomColumn["fieldType"]; label: string }[] = [
  { value: "TEXT", label: "Text" },
  { value: "NUMBER", label: "Number" },
  { value: "DATE", label: "Date" },
  { value: "BOOLEAN", label: "Yes/No" },
];

// Generic manager for user-addable extra columns (client/src/components/CustomColumnsModal.tsx),
// shared across Assets and Stock — any permitted user can add one from the list itself, spanning
// every row of that entityType. Reused as-is for both #716 (Stock) and #717 (Asset List).
export function CustomColumnsSheet({ visible, entityType, title, onClose }: { visible: boolean; entityType: string; title: string; onClose: () => void }) {
  const { colors, spacing, radius } = useTheme();
  const { columns, deleteMutation, createMutation } = useCustomColumns(entityType);
  const [name, setName] = useState("");
  const [fieldType, setFieldType] = useState<CustomColumn["fieldType"]>("TEXT");

  if (!visible) return null;

  function confirmDelete(c: CustomColumn) {
    Alert.alert("Remove Column", `Remove the "${c.name}" column? Values already saved for it will be lost.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => deleteMutation.mutate(c.id) },
    ]);
  }

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.bg };

  return (
    <View style={{ position: "absolute", inset: 0, backgroundColor: "#0008", justifyContent: "flex-end" }}>
      <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, maxHeight: "85%" }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>{title}</Text>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={colors.textMuted} /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ gap: 8 }}>
          {columns.map((c) => (
            <View key={c.id} style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{c.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{FIELD_TYPES.find((f) => f.value === c.fieldType)?.label}</Text>
              </View>
              <TouchableOpacity onPress={() => confirmDelete(c)}><Ionicons name="trash-outline" size={17} color={colors.danger} /></TouchableOpacity>
            </View>
          ))}
          {columns.length === 0 && <Text style={{ color: colors.textMuted, fontSize: 12 }}>No custom columns yet.</Text>}

          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginTop: 8 }}>Add Column</Text>
          <TextInput style={inputStyle} placeholder="Column name" placeholderTextColor={colors.textMuted} value={name} onChangeText={setName} />
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {FIELD_TYPES.map((t) => (
              <TouchableOpacity key={t.value} onPress={() => setFieldType(t.value)} style={{ borderWidth: 1, borderColor: fieldType === t.value ? colors.primary : colors.border, backgroundColor: fieldType === t.value ? colors.primary + "22" : colors.bg, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
                <Text style={{ color: fieldType === t.value ? colors.primary : colors.text, fontSize: 12, fontWeight: "600" }}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, opacity: name.trim() ? 1 : 0.5 }}
            disabled={!name.trim() || createMutation.isPending}
            onPress={() => { createMutation.mutate({ name: name.trim(), fieldType }); setName(""); setFieldType("TEXT"); }}
          >
            {createMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Add Column</Text>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  );
}

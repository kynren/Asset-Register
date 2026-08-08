import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute, RouteProp } from "@react-navigation/native";
import { ActivityIndicator, Alert, Linking, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { API_ORIGIN } from "../../config/env";
import { useAuth } from "../../auth/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { ShimmerList } from "../../components/Shimmer";
import { AssetsStackParamList } from "../../navigation/types";

interface FieldConfig { key: string; label: string; required?: boolean; type?: "text" | "date"; placeholder?: string }
type FileResourceKind = "contracts" | "documents";

const CONFIG: Record<FileResourceKind, { title: string; subtitle: string; addLabel: string; primary: string; fileOptional?: boolean; fields: FieldConfig[] }> = {
  contracts: {
    title: "Contracts", subtitle: "Vendor and service contracts associated with this asset.", addLabel: "Add Contract", primary: "vendor", fileOptional: true,
    fields: [{ key: "vendor", label: "Vendor", required: true, placeholder: "e.g. Dell ProSupport" }, { key: "contractNumber", label: "Contract #", placeholder: "Optional" }, { key: "startDate", label: "Start Date (YYYY-MM-DD)", type: "date" }, { key: "endDate", label: "End Date (YYYY-MM-DD)", type: "date" }, { key: "notes", label: "Notes", placeholder: "Optional" }],
  },
  documents: {
    title: "Documents", subtitle: "Manuals, receipts, and other files attached to this asset.", addLabel: "Upload Document", primary: "name",
    fields: [{ key: "name", label: "Document Name", required: true, placeholder: "e.g. User Manual" }],
  },
};

// Generic mirror of client/src/pages/assets/detail/FileResourceTab.tsx — used for Contracts and
// Documents. Uses expo-document-picker (same pattern as ImportDocsScreen.tsx).
export function AssetFileResourceScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const route = useRoute<RouteProp<AssetsStackParamList, "AssetFileResource">>();
  const { assetId, kind } = route.params;
  const cfg = CONFIG[kind as FileResourceKind];
  const canEdit = hasPermission("assets", "edit");
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);

  const { data: items, isLoading } = useQuery({
    queryKey: ["mobile-asset-file-resource", assetId, kind],
    queryFn: async () => (await axiosClient.get(`/asset-resources/${assetId}/${kind}`)).data as Record<string, any>[],
  });

  const createMutation = useMutation({
    mutationFn: (fd: FormData) => axiosClient.post(`/asset-resources/${assetId}/${kind}`, fd, { headers: { "Content-Type": "multipart/form-data" } }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["mobile-asset-file-resource", assetId, kind] }); setValues({}); setFile(null); },
  });
  const deleteMutation = useMutation({
    mutationFn: (itemId: number) => axiosClient.delete(`/asset-resources/${assetId}/${kind}/${itemId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-asset-file-resource", assetId, kind] }),
  });

  async function pickFile() {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    setFile(res.assets[0]);
  }

  function handleSubmit() {
    const fd = new FormData();
    for (const f of cfg.fields) {
      const raw = values[f.key];
      if (raw) fd.append(f.key, raw);
    }
    if (file) fd.append("file", { uri: file.uri, name: file.name, type: file.mimeType ?? "application/octet-stream" } as any);
    createMutation.mutate(fd);
  }

  function confirmDelete(item: Record<string, any>) {
    Alert.alert(`Delete ${cfg.title.replace(/s$/, "")}`, `Delete "${item[cfg.primary]}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(item.id) },
    ]);
  }

  const requiredFilled = cfg.fields.filter((f) => f.required).every((f) => values[f.key]);
  const canSubmit = requiredFilled && (cfg.fileOptional || !!file);
  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.bg };

  if (isLoading) return <ShimmerList />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>{cfg.subtitle}</Text>

      {canEdit && (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 10 }}>
          {cfg.fields.map((f) => (
            <TextInput key={f.key} style={inputStyle} placeholder={`${f.label}${f.required ? " *" : ""}`} placeholderTextColor={colors.textMuted} value={values[f.key] ?? ""} onChangeText={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
          ))}
          <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", borderRadius: radius.md, paddingVertical: 12 }} onPress={pickFile}>
            <Ionicons name="folder-open-outline" size={16} color={colors.text} />
            <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "600" }}>{file ? file.name : `Choose File${cfg.fileOptional ? " (optional)" : ""}`}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, opacity: canSubmit ? 1 : 0.5 }} disabled={!canSubmit || createMutation.isPending} onPress={handleSubmit}>
            {createMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{cfg.addLabel}</Text>}
          </TouchableOpacity>
        </View>
      )}

      {(items ?? []).length === 0 ? (
        <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: "center" }}>No {cfg.title.toLowerCase()} attached to this asset yet.</Text>
      ) : (
        (items ?? []).map((item) => (
          <View key={item.id} style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
            <Ionicons name="document-text-outline" size={20} color={colors.primary} style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{item[cfg.primary]}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                {cfg.fields.filter((f) => f.key !== cfg.primary && item[f.key]).map((f) => `${f.label}: ${item[f.key]}`).join(" · ")}
                {cfg.fields.filter((f) => f.key !== cfg.primary && item[f.key]).length > 0 ? " · " : ""}
                Added {dayjs(item.createdAt).format("DD MMM YYYY")}
              </Text>
            </View>
            {item.fileUrl && (
              <TouchableOpacity onPress={() => Linking.openURL(item.fileUrl.startsWith("http") ? item.fileUrl : `${API_ORIGIN}${item.fileUrl}`)} style={{ marginRight: 10 }}>
                <Ionicons name="open-outline" size={19} color={colors.text} />
              </TouchableOpacity>
            )}
            {canEdit && (
              <TouchableOpacity onPress={() => confirmDelete(item)}><Ionicons name="trash-outline" size={18} color={colors.danger} /></TouchableOpacity>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { AssetsStackParamList } from "../../navigation/types";

interface TargetField { key: string; label: string; required?: boolean; hints: string[] }
type Mapping = Record<string, string | undefined>;

const TARGET_FIELDS: TargetField[] = [
  { key: "assetTag", label: "Asset Tag", required: true, hints: ["asset tag", "assettag", "tag", "tag number", "asset id"] },
  { key: "name", label: "Asset Name", required: true, hints: ["asset name", "name", "description", "item"] },
  { key: "status", label: "Status", hints: ["status"] },
  { key: "manufacturer", label: "Manufacturer", hints: ["manufacturer", "make", "brand"] },
  { key: "model", label: "Model", hints: ["model"] },
  { key: "serialNumber", label: "Serial Number", hints: ["serial number", "serial", "sn"] },
  { key: "category", label: "Category", hints: ["category", "type"] },
  { key: "location", label: "Location", hints: ["location", "site", "office", "building"] },
  { key: "assignedToName", label: "Assigned To — Full Name", hints: ["assigned to", "owner", "user", "employee", "full name", "assignee", "custodian"] },
  { key: "assignedToEmail", label: "Assigned To — Email", hints: ["email", "e-mail", "user email", "owner email"] },
];

function autoMap(headerRow: string[]): Mapping {
  const used = new Set<string>();
  const mapping: Mapping = {};
  for (const field of TARGET_FIELDS) {
    const match = headerRow.find((h) => {
      if (used.has(h)) return false;
      const norm = h.trim().toLowerCase();
      return field.hints.some((hint) => norm === hint || norm.includes(hint));
    });
    if (match) { mapping[field.key] = match; used.add(match); }
  }
  return mapping;
}

interface ImportResult { created: number; errors: string[]; usersCreated: { id: number; email: string; tempPassword: string }[] }

// Mirrors client/src/pages/assets/AssetImportWizardModal.tsx's header-matching CSV import.
export function AssetImportScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<AssetsStackParamList>>();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [rows, setRows] = useState<string[][]>([]);
  const [headerRowIndex, setHeaderRowIndex] = useState(0);
  const [mapping, setMapping] = useState<Mapping>({});
  const [fieldPickerKey, setFieldPickerKey] = useState<string | null>(null);

  const previewMutation = useMutation({
    mutationFn: async (f: DocumentPicker.DocumentPickerAsset) => {
      const fd = new FormData();
      fd.append("file", { uri: f.uri, name: f.name, type: f.mimeType ?? "text/csv" } as any);
      const res = await axiosClient.post("/assets/import/preview", fd, { headers: { "Content-Type": "multipart/form-data" } });
      return res.data as { rows: string[][]; totalRows: number };
    },
    onSuccess: (data) => {
      setRows(data.rows);
      setHeaderRowIndex(0);
      setMapping(autoMap(data.rows[0] ?? []));
      setStep(2);
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file selected");
      const fd = new FormData();
      fd.append("file", { uri: file.uri, name: file.name, type: file.mimeType ?? "text/csv" } as any);
      fd.append("headerRowIndex", String(headerRowIndex));
      fd.append("mapping", JSON.stringify(mapping));
      const res = await axiosClient.post("/assets/import", fd, { headers: { "Content-Type": "multipart/form-data" } });
      return res.data as ImportResult;
    },
    onSuccess: () => { setStep(3); queryClient.invalidateQueries({ queryKey: ["mobile-assets"] }); queryClient.invalidateQueries({ queryKey: ["mobile-asset-stats"] }); },
  });

  async function pickFile() {
    const res = await DocumentPicker.getDocumentAsync({ type: "text/csv", copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const f = res.assets[0];
    setFile(f);
    previewMutation.mutate(f);
  }

  function updateHeaderRow(i: number) {
    setHeaderRowIndex(i);
    setMapping(autoMap(rows[i] ?? []));
  }

  const headerRow = rows[headerRowIndex] ?? [];
  const fieldOptions: PickerOption[] = headerRow.map((h, i) => ({ id: h, label: h || `Column ${i + 1}` }));
  const canSubmit = Boolean(mapping.assetTag && mapping.name);
  const activeField = TARGET_FIELDS.find((f) => f.key === fieldPickerKey);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      {step === 1 && (
        <View style={{ gap: spacing.md }}>
          <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>Choose a CSV file. We'll guess a column mapping from your headers.</Text>
          <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 14 }} onPress={pickFile} disabled={previewMutation.isPending}>
            {previewMutation.isPending ? <ActivityIndicator size="small" color={colors.text} /> : <Ionicons name="folder-open-outline" size={18} color={colors.text} />}
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>{previewMutation.isPending ? "Reading file..." : "Choose CSV File"}</Text>
          </TouchableOpacity>
          {previewMutation.isError && <Text style={{ color: colors.danger, fontSize: 12 }}>{(previewMutation.error as any)?.response?.data?.error ?? "Could not read this file."}</Text>}
        </View>
      )}

      {step === 2 && (
        <View style={{ gap: spacing.md }}>
          <View>
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700", marginBottom: 6 }}>1. Which row is the header?</Text>
            <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, maxHeight: 160 }}>
              <ScrollView>
                {rows.slice(0, 10).map((r, i) => (
                  <TouchableOpacity key={i} onPress={() => updateHeaderRow(i)} style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 8, backgroundColor: i === headerRowIndex ? colors.primary + "1a" : "transparent", borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <Ionicons name={i === headerRowIndex ? "radio-button-on" : "radio-button-off"} size={16} color={i === headerRowIndex ? colors.primary : colors.textMuted} />
                    <Text style={{ color: colors.text, fontSize: 11.5, flex: 1 }} numberOfLines={1}>{r.slice(0, 5).join(" · ") || "—"}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>

          <View>
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700", marginBottom: 6 }}>2. Map columns to asset fields</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11.5, marginBottom: 8 }}>An email column for "Assigned To" auto-creates a Viewer account (temp password) if one doesn't exist yet.</Text>
            <View style={{ gap: 8 }}>
              {TARGET_FIELDS.map((f) => (
                <View key={f.key} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ color: colors.textMuted, fontSize: 12.5, flex: 1 }}>{f.label}{f.required ? " *" : ""}</Text>
                  <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 7, minWidth: 130 }} onPress={() => setFieldPickerKey(f.key)}>
                    <Text style={{ color: mapping[f.key] ? colors.text : colors.textMuted, fontSize: 12 }} numberOfLines={1}>{mapping[f.key] ?? "-- Not mapped --"}</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>

          {importMutation.isError && <Text style={{ color: colors.danger, fontSize: 12 }}>{(importMutation.error as any)?.response?.data?.error ?? "Import failed."}</Text>}

          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: "center", paddingVertical: 12 }} onPress={() => { setStep(1); setFile(null); }}>
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>Choose different file</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, opacity: canSubmit ? 1 : 0.5 }} disabled={!canSubmit || importMutation.isPending} onPress={() => importMutation.mutate()}>
              {importMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Import Assets</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {step === 3 && importMutation.data && (
        <View style={{ gap: spacing.md }}>
          <View style={{ backgroundColor: (importMutation.data.errors.length ? colors.warning : colors.success) + "1a", borderRadius: radius.md, padding: 12 }}>
            <Text style={{ color: importMutation.data.errors.length ? colors.warning : colors.success, fontSize: 13 }}>
              Imported {importMutation.data.created} asset(s).{importMutation.data.errors.length > 0 ? ` ${importMutation.data.errors.length} row(s) had errors.` : ""}
            </Text>
          </View>
          {importMutation.data.usersCreated.length > 0 && (
            <View>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700", marginBottom: 6 }}>New users created</Text>
              {importMutation.data.usersCreated.map((u) => (
                <Text key={u.id} style={{ color: colors.textMuted, fontSize: 11.5 }}>{u.email} — temp password: {u.tempPassword}</Text>
              ))}
            </View>
          )}
          {importMutation.data.errors.length > 0 && (
            <View>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700", marginBottom: 6 }}>Row errors</Text>
              {importMutation.data.errors.map((e, i) => <Text key={i} style={{ color: colors.textMuted, fontSize: 11.5 }}>{e}</Text>)}
            </View>
          )}
          <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 13 }} onPress={() => navigation.goBack()}>
            <Text style={{ color: "#fff", fontWeight: "700" }}>Done</Text>
          </TouchableOpacity>
        </View>
      )}

      <PickerModal
        visible={fieldPickerKey !== null}
        title={activeField?.label ?? "Column"}
        options={fieldOptions}
        allowClear
        selectedId={fieldPickerKey ? mapping[fieldPickerKey] ?? null : null}
        onSelect={(id) => { if (fieldPickerKey) setMapping((m) => ({ ...m, [fieldPickerKey]: (id as string | null) ?? undefined })); }}
        onClose={() => setFieldPickerKey(null)}
      />
    </ScrollView>
  );
}

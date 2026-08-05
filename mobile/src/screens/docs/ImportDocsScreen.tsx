import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { downloadAndShare } from "../../lib/downloadFile";
import { DOC_TYPES, DOC_TYPE_DESCRIPTIONS, DOC_TYPE_LABELS, DocType } from "../../lib/docsConstants";
import { MoreStackParamList } from "../../navigation/types";

interface ImportOutcome {
  fileName: string;
  ok: boolean;
  docId?: number;
  unmatchedHeadings?: string[];
  error?: string;
}

// Mirrors client/src/pages/docs/ImportDocsWizardModal.tsx — pick a target document type (so the
// header-matching import knows which field labels to match against), optionally download that
// type's blank Word template, then upload picked PDF/Word files.
export function ImportDocsScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const queryClient = useQueryClient();

  const [docType, setDocType] = useState<DocType>("SOP");
  const [files, setFiles] = useState<DocumentPicker.DocumentPickerAsset[]>([]);
  const [results, setResults] = useState<ImportOutcome[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  const { data: collections } = useQuery({ queryKey: ["mobile-docs-collections"], queryFn: async () => (await axiosClient.get("/docs/collections")).data as { id: number; name: string }[] });
  const { data: importSettings } = useQuery({ queryKey: ["mobile-docs-import-settings"], queryFn: async () => (await axiosClient.get("/docs/import-settings")).data as { maxFiles: number } });
  const maxFiles = importSettings?.maxFiles ?? 5;

  async function downloadTemplate() {
    setDownloadingTemplate(true);
    try {
      await downloadAndShare(`/docs/template/${docType}`, `${docType.toLowerCase()}_template.docx`);
    } finally {
      setDownloadingTemplate(false);
    }
  }

  async function pickFiles() {
    const res = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets) return;
    setFiles(res.assets.slice(0, maxFiles));
  }

  const importOneMutation = useMutation({
    mutationFn: async (file: DocumentPicker.DocumentPickerAsset) => {
      const fd = new FormData();
      fd.append("file", { uri: file.uri, name: file.name, type: file.mimeType ?? "application/octet-stream" } as any);
      fd.append("collectionId", String(collections?.[0]?.id ?? ""));
      fd.append("docType", docType);
      return (await axiosClient.post("/docs/import", fd, { headers: { "Content-Type": "multipart/form-data" } })).data;
    },
  });

  async function handleImportAll() {
    setImporting(true);
    const outcomes: ImportOutcome[] = [];
    for (const file of files) {
      try {
        const doc = await importOneMutation.mutateAsync(file);
        outcomes.push({ fileName: file.name, ok: true, docId: doc.id, unmatchedHeadings: doc.unmatchedHeadings ?? [] });
      } catch (err: any) {
        outcomes.push({ fileName: file.name, ok: false, error: err?.response?.data?.error ?? "Import failed" });
      }
    }
    setResults(outcomes);
    setImporting(false);
    queryClient.invalidateQueries({ queryKey: ["mobile-docs"] });
  }

  const labelStyle = { color: colors.textMuted, fontSize: 12, fontWeight: "700" as const, marginBottom: 8, textTransform: "uppercase" as const };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      {!results && (
        <>
          <Text style={labelStyle}>Document Type</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.sm }}>
            {DOC_TYPES.map((t) => (
              <TouchableOpacity
                key={t}
                style={{ borderWidth: 1, borderColor: docType === t ? colors.primary : colors.border, backgroundColor: docType === t ? colors.primary + "22" : colors.surface, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 }}
                onPress={() => setDocType(t)}
              >
                <Text style={{ color: docType === t ? colors.primary : colors.text, fontSize: 12, fontWeight: "600" }}>{DOC_TYPE_LABELS[t]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 11.5, marginBottom: spacing.md }}>{DOC_TYPE_DESCRIPTIONS[docType]}</Text>

          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.md }}>
            Word (.docx) files are matched by heading against this type's fields — download the template below, fill it in keeping the headings as-is, then upload it back. PDFs and unmatched content always import safely, just without that structure.
          </Text>
          <TouchableOpacity
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12, marginBottom: spacing.lg }}
            onPress={downloadTemplate}
            disabled={downloadingTemplate}
          >
            {downloadingTemplate ? <ActivityIndicator size="small" color={colors.text} /> : <Ionicons name="download-outline" size={16} color={colors.text} />}
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>Download Template</Text>
          </TouchableOpacity>

          <Text style={labelStyle}>Files to Import (up to {maxFiles})</Text>
          <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 14, marginBottom: spacing.sm }} onPress={pickFiles}>
            <Ionicons name="folder-open-outline" size={18} color={colors.text} />
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>Choose Files</Text>
          </TouchableOpacity>
          {files.map((f) => (
            <Text key={f.uri} style={{ color: colors.textMuted, fontSize: 12.5, marginBottom: 2 }}>• {f.name}</Text>
          ))}

          <TouchableOpacity
            style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 15, marginTop: spacing.lg, opacity: files.length ? 1 : 0.5 }}
            disabled={files.length === 0 || importing}
            onPress={handleImportAll}
          >
            {importing ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Import {files.length || ""}</Text>}
          </TouchableOpacity>
        </>
      )}

      {results && (
        <>
          <View style={{ gap: spacing.sm }}>
            {results.map((r) => (
              <View key={r.fileName} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                <Ionicons name={r.ok ? "checkmark-circle-outline" : "close-circle-outline"} size={16} color={r.ok ? colors.success : colors.danger} />
                <View style={{ flex: 1 }}>
                  <TouchableOpacity disabled={!r.ok} onPress={() => r.docId && navigation.replace("DocumentDetail", { id: r.docId })}>
                    <Text style={{ fontSize: 13, color: r.ok ? colors.primary : colors.text }}>{r.fileName}{r.ok ? " — view document" : ""}</Text>
                  </TouchableOpacity>
                  {!r.ok && <Text style={{ color: colors.textMuted, fontSize: 11.5 }}>{r.error}</Text>}
                  {r.ok && !!r.unmatchedHeadings?.length && (
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>Headings not matched (filed under Additional Notes): {r.unmatchedHeadings.join(", ")}</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
          <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 15, marginTop: spacing.lg }} onPress={() => navigation.goBack()}>
            <Text style={{ color: "#fff", fontWeight: "700" }}>Done</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

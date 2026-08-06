import { useLayoutEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { downloadAndShare } from "../../lib/downloadFile";
import { canDeleteRecord, canEditRecord, canManageRecordAccess } from "../../lib/accessControl";
import { ShimmerDetail } from "../../components/Shimmer";
import { DOC_TYPE_LABELS, DocumentDetail } from "../../types/docs";
import { MoreStackParamList } from "../../navigation/types";

function humanize(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// Sections shape varies per docType (SOP steps, checklist items, runbook procedures, etc — see
// server/src/modules/docs/docs.schema.ts) — rather than one bespoke layout per type like the web
// app's SectionsView, this walks whatever shape it's given and renders it as labeled text blocks.
// Rich-text (HTML) leaves are tag-stripped rather than rendered in a WebView, keeping this simple
// for what's meant to be a quick on-site lookup, not a formatted document viewer.
function SectionValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  const { colors, spacing } = useTheme();
  if (value === null || value === undefined) return null;

  if (typeof value === "string") {
    const text = stripHtml(value);
    if (!text) return null;
    return <Text style={{ color: colors.text, fontSize: 13.5, lineHeight: 20 }}>{text}</Text>;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return <Text style={{ color: colors.text, fontSize: 13.5 }}>{String(value)}</Text>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return (
      <View style={{ gap: spacing.sm }}>
        {value.map((item, i) => (
          <View key={i} style={{ flexDirection: "row", gap: 8 }}>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>{depth === 0 ? `${i + 1}.` : "•"}</Text>
            <View style={{ flex: 1 }}>
              <SectionValue value={item} depth={depth + 1} />
            </View>
          </View>
        ))}
      </View>
    );
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined && v !== "");
    if (entries.length === 0) return null;
    return (
      <View style={{ gap: 4 }}>
        {entries.map(([k, v]) => (
          <View key={k}>
            {typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? (
              <Text style={{ fontSize: 13.5 }}>
                <Text style={{ color: colors.textMuted, fontWeight: "600" }}>{humanize(k)}: </Text>
                <Text style={{ color: colors.text }}>{typeof v === "string" ? stripHtml(v) : String(v)}</Text>
              </Text>
            ) : (
              <>
                <Text style={{ color: colors.textMuted, fontWeight: "600", fontSize: 12.5, marginBottom: 2 }}>{humanize(k)}</Text>
                <SectionValue value={v} depth={depth + 1} />
              </>
            )}
          </View>
        ))}
      </View>
    );
  }
  return null;
}

export function DocumentDetailScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const route = useRoute<RouteProp<MoreStackParamList, "DocumentDetail">>();
  const { user, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const { id } = route.params;
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);

  const { data: doc, isLoading } = useQuery({
    queryKey: ["mobile-document", id],
    queryFn: async () => (await axiosClient.get(`/docs/${id}`)).data as DocumentDetail,
  });

  const deleteMutation = useMutation({
    mutationFn: () => axiosClient.delete(`/docs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-docs"] });
      navigation.goBack();
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async () => (await axiosClient.post(`/docs/${id}/duplicate`)).data as DocumentDetail,
    onSuccess: (clone) => {
      queryClient.invalidateQueries({ queryKey: ["mobile-docs"] });
      navigation.replace("DocumentDetail", { id: clone.id });
    },
  });

  async function exportDocument(format: "pdf" | "docx") {
    setExporting(format);
    try {
      await downloadAndShare(`/docs/${id}/export`, `${(doc?.title ?? "document").replace(/[^a-z0-9-_]+/gi, "_")}.${format}`, { format });
    } catch {
      Alert.alert("Export failed", "Could not generate the export. Try again.");
    } finally {
      setExporting(null);
    }
  }

  function confirmDelete() {
    Alert.alert("Delete document", `Delete "${doc?.title}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate() },
    ]);
  }

  useLayoutEffect(() => {
    navigation.setOptions({ title: doc?.title ?? "Document" });
  }, [navigation, doc]);

  // No team-membership list is exposed to the mobile auth context yet (web's /auth/me returns
  // myTeamIds; mobile's doesn't), so team-based access grants aren't evaluated here — only the
  // creator, direct user grants, and System/Super Admin bypass roles gate these actions.
  const myTeamIds: number[] = [];
  const canEdit = !!user && !!doc && canEditRecord(doc.createdById, doc.access, user.id, user.roleName, myTeamIds);
  const canDelete = !!user && !!doc && canDeleteRecord(doc.createdById, doc.access, user.id, user.roleName, myTeamIds);
  const canManageAccess = !!user && !!doc && canManageRecordAccess(doc.createdById, user.id, user.roleName);

  if (isLoading || !doc) {
    return <ShimmerDetail />;
  }

  const sectionEntries = Object.entries(doc.sections ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== "");

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.lg }}>
        <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700", textTransform: "uppercase" }}>
          {DOC_TYPE_LABELS[doc.docType]}
          {doc.category ? ` · ${doc.category}` : ""}
        </Text>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800", marginTop: 4 }}>{doc.title}</Text>
        {doc.summary && <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 6 }}>{doc.summary}</Text>}
        <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 10 }}>
          {doc.createdBy ? `${doc.createdBy.firstName} ${doc.createdBy.lastName} · ` : ""}Updated {dayjs(doc.updatedAt).format("DD MMM YYYY")}
        </Text>
        {doc.reviewDueDate && (
          <Text style={{ color: colors.warning, fontSize: 11.5, marginTop: 4 }}>Review due {dayjs(doc.reviewDueDate).format("DD MMM YYYY")}</Text>
        )}
        {!!doc.tags.length && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {doc.tags.map((tag) => (
              <View key={tag} style={{ backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
                <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "600" }}>{tag}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.lg }} contentContainerStyle={{ gap: 8 }}>
        {canManageAccess && (
          <ActionButton icon="people-outline" label={`Access (${doc.access.length})`} onPress={() => navigation.navigate("ManageAccess", { apiBasePath: `/docs/${id}`, queryKeyToInvalidate: "mobile-document", title: doc.title })} />
        )}
        {canEdit && hasPermission("docs", "edit") && (
          <ActionButton icon="create-outline" label="Edit" onPress={() => navigation.navigate("DocumentForm", { id })} />
        )}
        {hasPermission("docs", "create") && <ActionButton icon="copy-outline" label="Duplicate" loading={duplicateMutation.isPending} onPress={() => duplicateMutation.mutate()} />}
        <ActionButton icon="download-outline" label="PDF" loading={exporting === "pdf"} onPress={() => exportDocument("pdf")} />
        <ActionButton icon="download-outline" label="Word" loading={exporting === "docx"} onPress={() => exportDocument("docx")} />
        {canDelete && hasPermission("docs", "delete") && <ActionButton icon="trash-outline" label="Delete" danger onPress={confirmDelete} />}
      </ScrollView>

      <View style={{ gap: spacing.lg }}>
        {sectionEntries.map(([key, value]) => (
          <View key={key} style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
            <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "700", marginBottom: 8 }}>{humanize(key)}</Text>
            <SectionValue value={value} />
          </View>
        ))}
      </View>

      {!!doc.attachments.length && (
        <View style={{ marginTop: spacing.lg }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", marginBottom: 8 }}>Attachments</Text>
          {doc.attachments.map((a) => (
            <View key={a.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Ionicons name="document-attach-outline" size={16} color={colors.textMuted} />
              <Text style={{ color: colors.text, fontSize: 13 }}>{a.fileName}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function ActionButton({ icon, label, loading, danger, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; loading?: boolean; danger?: boolean; onPress: () => void }) {
  const { colors, radius } = useTheme();
  const color = danger ? colors.danger : colors.text;
  return (
    <TouchableOpacity
      style={{ flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: danger ? colors.danger : colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface }}
      disabled={loading}
      onPress={onPress}
    >
      {loading ? <ActivityIndicator size="small" color={color} /> : <Ionicons name={icon} size={14} color={color} />}
      <Text style={{ color, fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </TouchableOpacity>
  );
}

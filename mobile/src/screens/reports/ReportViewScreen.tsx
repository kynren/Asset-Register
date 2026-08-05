import { useLayoutEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { downloadAndShare } from "../../lib/downloadFile";
import { ReportResult, ReportSummary } from "../../types/reports";
import { MoreStackParamList } from "../../navigation/types";

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function ReportViewScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const route = useRoute<RouteProp<MoreStackParamList, "ReportView">>();
  const { hasPermission } = useAuth();
  const { id } = route.params;
  const [downloading, setDownloading] = useState<"csv" | "pdf" | null>(null);

  const { data: report } = useQuery({
    queryKey: ["mobile-report-meta", id],
    queryFn: async () => (await axiosClient.get(`/reports/${id}`)).data as ReportSummary & { description: string | null },
  });

  async function downloadReport(kind: "csv" | "pdf") {
    setDownloading(kind);
    try {
      await downloadAndShare(`/reports/${id}/export.${kind}`, `${(report?.name ?? "report").replace(/[^a-z0-9-_]+/gi, "_")}.${kind}`);
    } catch {
      Alert.alert("Export failed", "Could not generate the export. Try again.");
    } finally {
      setDownloading(null);
    }
  }

  const { data: result, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["mobile-report-run", id],
    queryFn: async () => (await axiosClient.get(`/reports/${id}/run`)).data as ReportResult,
  });

  useLayoutEffect(() => {
    navigation.setOptions({ title: report?.name ?? "Report" });
  }, [navigation, report]);

  if (isLoading || !result) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
    >
      {report?.description && <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: spacing.md }}>{report.description}</Text>}

      {report && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.lg }} contentContainerStyle={{ gap: 8 }}>
          {report.canEdit && hasPermission("reports", "edit") && (
            <ActionButton icon="create-outline" label="Edit" onPress={() => navigation.navigate("ReportBuilder", { reportId: id })} />
          )}
          {hasPermission("reports", "export") && (
            <>
              <ActionButton icon="download-outline" label="CSV" loading={downloading === "csv"} onPress={() => downloadReport("csv")} />
              <ActionButton icon="download-outline" label="PDF" loading={downloading === "pdf"} onPress={() => downloadReport("pdf")} />
              <ActionButton icon="mail-outline" label="Email" onPress={() => navigation.navigate("EmailReport", { id, name: report.name })} />
            </>
          )}
          {report.isOwner && hasPermission("reports", "edit") && (
            <ActionButton icon="share-social-outline" label="Share" onPress={() => navigation.navigate("ShareReport", { id })} />
          )}
        </ScrollView>
      )}

      {result.kind === "kpi" ? (
        <View style={{ backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.lg }}>
          <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700", textTransform: "uppercase", opacity: 0.85 }}>{report?.name}</Text>
          <Text style={{ color: "#fff", fontSize: 36, fontWeight: "800", marginTop: 6 }}>{result.value.toLocaleString()}</Text>
        </View>
      ) : result.kind === "chart" ? (
        <View style={{ gap: spacing.sm }}>
          {result.data.map((d) => {
            const max = Math.max(...result.data.map((x) => x.count), 1);
            const pct = Math.max(4, Math.round((d.count / max) * 100));
            return (
              <View key={d.label} style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{d.label}</Text>
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}>{d.count}</Text>
                </View>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden" }}>
                  <View style={{ width: `${pct}%`, height: "100%", backgroundColor: colors.primary }} />
                </View>
              </View>
            );
          })}
          {result.data.length === 0 && <Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 20 }}>No data.</Text>}
        </View>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {result.rows.map((row, i) => (
            <View key={i} style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
              {result.columns.map((col) => (
                <View key={col} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}>{col}</Text>
                  <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "600", flex: 1, textAlign: "right" }}>{formatCell(row[col])}</Text>
                </View>
              ))}
            </View>
          ))}
          {result.rows.length === 0 && <Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 20 }}>No rows.</Text>}
        </View>
      )}
    </ScrollView>
  );
}

function ActionButton({ icon, label, loading, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; loading?: boolean; onPress: () => void }) {
  const { colors, radius } = useTheme();
  return (
    <TouchableOpacity
      style={{ flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface }}
      disabled={loading}
      onPress={onPress}
    >
      {loading ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name={icon} size={14} color={colors.text} />}
      <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </TouchableOpacity>
  );
}

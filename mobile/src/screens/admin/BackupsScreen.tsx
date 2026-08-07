import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { ShimmerListItem } from "../../components/Shimmer";
import { useToast } from "../../components/toast/ToastProvider";
import { MoreStackParamList } from "../../navigation/types";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface BackupSettings {
  isEnabled: boolean;
  daysOfWeek: number[];
  timeOfDay: string;
}
interface BackupDestination {
  id: number;
  type: "EMAIL" | "S3";
  name: string;
  isEnabled: boolean;
  emailTo: string | null;
  s3Bucket: string | null;
  s3PathPrefix: string | null;
  s3Endpoint: string | null;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
}
interface BackupRunDestination {
  id: number;
  destinationName: string;
  ok: boolean;
  message: string | null;
}
interface BackupRun {
  id: number;
  trigger: "SCHEDULED" | "MANUAL";
  status: "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED";
  fileSizeBytes: number | null;
  message: string | null;
  startedAt: string;
  deliveries: BackupRunDestination[];
}

const STATUS_COLOR: Record<BackupRun["status"], "primary" | "success" | "warning" | "danger"> = {
  RUNNING: "primary",
  SUCCESS: "success",
  PARTIAL: "warning",
  FAILED: "danger",
};

function formatBytes(n: number | null): string {
  if (n === null) return "—";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function BackupsScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const queryClient = useQueryClient();
  const canEdit = hasPermission("app-settings", "edit");
  const [runPage, setRunPage] = useState(1);
  const [draft, setDraft] = useState<BackupSettings | null>(null);

  const { data: settings } = useQuery({ queryKey: ["mobile-backup-settings"], queryFn: async () => (await axiosClient.get("/backups/settings")).data as BackupSettings });
  const { data: destinations } = useQuery({ queryKey: ["mobile-backup-destinations"], queryFn: async () => (await axiosClient.get("/backups/destinations")).data as BackupDestination[] });
  const { data: runsPage, isLoading: runsLoading } = useQuery({
    queryKey: ["mobile-backup-runs", runPage],
    queryFn: async () => (await axiosClient.get(`/backups/runs?page=${runPage}&pageSize=15`)).data as { runs: BackupRun[]; total: number; page: number; pageSize: number },
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (settings && !draft) setDraft(settings);
  }, [settings, draft]);

  const saveSettingsMutation = useMutation({
    mutationFn: (values: BackupSettings) => axiosClient.put("/backups/settings", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-backup-settings"] });
      showToast({ variant: "success", title: "Backup schedule saved" });
    },
  });
  const runNowMutation = useMutation({
    mutationFn: () => axiosClient.post("/backups/run-now"),
    onSuccess: () => setTimeout(() => queryClient.invalidateQueries({ queryKey: ["mobile-backup-runs"] }), 1500),
  });
  const testDestinationMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`/backups/destinations/${id}/test`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-backup-destinations"] }),
  });

  function confirmDelete(d: BackupDestination) {
    Alert.alert("Delete destination", `Delete "${d.name}"? Future backups will no longer be sent here.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => axiosClient.delete(`/backups/destinations/${d.id}`).then(() => queryClient.invalidateQueries({ queryKey: ["mobile-backup-destinations"] })) },
    ]);
  }

  function toggleDay(d: number) {
    if (!draft || !canEdit) return;
    const has = draft.daysOfWeek.includes(d);
    setDraft({ ...draft, daysOfWeek: has ? draft.daysOfWeek.filter((x) => x !== d) : [...draft.daysOfWeek, d] });
  }

  const sectionTitle = { color: colors.text, fontSize: 14, fontWeight: "700" as const, marginBottom: spacing.sm };
  const panel = { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={panel}>
        <Text style={sectionTitle}>Backup Schedule</Text>
        <Text style={{ color: colors.textMuted, fontSize: 11.5, marginBottom: spacing.md }}>Runs a full database dump on the days/time below and pushes it to every enabled destination.</Text>
        {draft && (
          <>
            <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.md }} disabled={!canEdit} onPress={() => setDraft({ ...draft, isEnabled: !draft.isEnabled })}>
              <Ionicons name={draft.isEnabled ? "checkbox" : "square-outline"} size={20} color={draft.isEnabled ? colors.primary : colors.textMuted} />
              <Text style={{ color: colors.text, fontSize: 12.5 }}>Enabled</Text>
            </TouchableOpacity>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginBottom: 8 }}>Days</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: spacing.md }}>
              {DAY_LABELS.map((label, i) => {
                const active = draft.daysOfWeek.includes(i);
                return (
                  <TouchableOpacity key={label} style={{ borderWidth: 1, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "22" : colors.bg, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 }} onPress={() => toggleDay(i)}>
                    <Text style={{ color: active ? colors.primary : colors.text, fontSize: 12, fontWeight: "700" }}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginBottom: 8 }}>Time ({draft.timeOfDay})</Text>
            <View style={{ flexDirection: "row", gap: 6, marginBottom: spacing.md, flexWrap: "wrap" }}>
              {["06:00", "09:00", "12:00", "18:00", "22:00", "23:30"].map((t) => (
                <TouchableOpacity key={t} style={{ borderWidth: 1, borderColor: draft.timeOfDay === t ? colors.primary : colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 7 }} disabled={!canEdit} onPress={() => setDraft({ ...draft, timeOfDay: t })}>
                  <Text style={{ color: draft.timeOfDay === t ? colors.primary : colors.text, fontSize: 11.5, fontWeight: "700" }}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {canEdit && (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity style={{ flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 11 }} disabled={saveSettingsMutation.isPending} onPress={() => saveSettingsMutation.mutate(draft)}>
                  {saveSettingsMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>Save Schedule</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: "center", paddingVertical: 11, flexDirection: "row", justifyContent: "center", gap: 5 }} disabled={runNowMutation.isPending} onPress={() => runNowMutation.mutate()}>
                  <Ionicons name="play-outline" size={14} color={colors.text} />
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12.5 }}>{runNowMutation.isPending ? "Starting..." : "Run Now"}</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </View>

      <View style={panel}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
          <Text style={[sectionTitle, { marginBottom: 0 }]}>Destinations</Text>
          {hasPermission("app-settings", "create") && (
            <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => navigation.navigate("BackupDestinationForm", undefined)}>
              <Ionicons name="add" size={14} color={colors.text} />
              <Text style={{ color: colors.text, fontSize: 11.5, fontWeight: "700" }}>Add</Text>
            </TouchableOpacity>
          )}
        </View>
        {(destinations ?? []).length === 0 && <Text style={{ color: colors.textMuted, fontSize: 12 }}>No destinations configured yet.</Text>}
        {(destinations ?? []).map((d) => (
          <View key={d.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>{d.name}</Text>
              <View style={{ backgroundColor: colors.border, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ color: colors.textMuted, fontSize: 9.5, fontWeight: "700" }}>{d.type}</Text>
              </View>
              {d.lastTestOk === true && <View style={{ backgroundColor: colors.success + "22", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}><Text style={{ color: colors.success, fontSize: 9.5, fontWeight: "700" }}>Connected</Text></View>}
              {d.lastTestOk === false && <View style={{ backgroundColor: colors.danger + "22", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}><Text style={{ color: colors.danger, fontSize: 9.5, fontWeight: "700" }}>Failed</Text></View>}
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{d.type === "EMAIL" ? d.emailTo : `${d.s3Bucket}${d.s3PathPrefix ? `/${d.s3PathPrefix}` : ""}`}</Text>
            {hasPermission("app-settings", "edit") && (
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} disabled={testDestinationMutation.isPending} onPress={() => testDestinationMutation.mutate(d.id)}>
                  <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Test</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => navigation.navigate("BackupDestinationForm", { id: d.id })}>
                  <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Edit</Text>
                </TouchableOpacity>
                {hasPermission("app-settings", "delete") && (
                  <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => confirmDelete(d)}>
                    <Text style={{ color: colors.danger, fontSize: 11, fontWeight: "700" }}>Delete</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        ))}
      </View>

      <View style={panel}>
        <Text style={sectionTitle}>Run History</Text>
        {runsLoading && (
          <View style={{ gap: spacing.sm }}>
            <ShimmerListItem />
            <ShimmerListItem />
            <ShimmerListItem />
          </View>
        )}
        {(runsPage?.runs ?? []).map((r) => (
          <View key={r.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "600" }}>{dayjs(r.startedAt).format("DD MMM, HH:mm:ss")}</Text>
              <View style={{ backgroundColor: colors[STATUS_COLOR[r.status]] + "22", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ color: colors[STATUS_COLOR[r.status]], fontSize: 10, fontWeight: "700" }}>{r.status}</Text>
              </View>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{r.trigger} · {formatBytes(r.fileSizeBytes)}</Text>
            {r.deliveries.length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                {r.deliveries.map((d) => (
                  <View key={d.id} style={{ backgroundColor: (d.ok ? colors.success : colors.danger) + "22", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ color: d.ok ? colors.success : colors.danger, fontSize: 9.5, fontWeight: "700" }}>{d.destinationName}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}
        {!runsLoading && (runsPage?.runs.length ?? 0) === 0 && <Text style={{ color: colors.textMuted, fontSize: 12 }}>No backups have run yet.</Text>}
        {runsPage && runsPage.total > runsPage.pageSize && (
          <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 10, marginTop: 10 }}>
            <TouchableOpacity disabled={runPage <= 1} onPress={() => setRunPage((p) => p - 1)}><Text style={{ color: runPage <= 1 ? colors.textMuted : colors.primary, fontSize: 12, fontWeight: "700" }}>‹ Prev</Text></TouchableOpacity>
            <Text style={{ color: colors.textMuted, fontSize: 11.5 }}>Page {runsPage.page} of {Math.max(1, Math.ceil(runsPage.total / runsPage.pageSize))}</Text>
            <TouchableOpacity disabled={runPage * runsPage.pageSize >= runsPage.total} onPress={() => setRunPage((p) => p + 1)}><Text style={{ color: runPage * runsPage.pageSize >= runsPage.total ? colors.textMuted : colors.primary, fontSize: 12, fontWeight: "700" }}>Next ›</Text></TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

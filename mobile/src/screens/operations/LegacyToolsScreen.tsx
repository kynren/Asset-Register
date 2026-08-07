import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { useToast } from "../../components/toast/ToastProvider";
import { downloadAndShare } from "../../lib/downloadFile";

const STATUS_OPTIONS = ["IN_USE", "IN_STORAGE", "IN_REPAIR", "RETIRED", "LOST"];
const REPORTS = [
  { type: "assets", label: "Asset Register Report" },
  { type: "stock", label: "Stock Register Report" },
  { type: "tickets", label: "Helpdesk Ticket Report" },
];

export function LegacyToolsScreen() {
  const { colors, spacing, radius } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [bulkStatus, setBulkStatus] = useState("IN_STORAGE");
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [alertResult, setAlertResult] = useState<{ warrantyAlerts: number; serviceAlerts: number } | null>(null);

  const { data: assets } = useQuery({
    queryKey: ["mobile-assets-for-bulk"],
    queryFn: async () => (await axiosClient.get("/assets", { params: { pageSize: 100 } })).data.items as any[],
  });
  const { data: dueAssets } = useQuery({
    queryKey: ["mobile-maintenance-due"],
    queryFn: async () => (await axiosClient.get("/operations/maintenance-due")).data as any[],
  });
  const { data: warrantyAssets } = useQuery({
    queryKey: ["mobile-warranty-expiring"],
    queryFn: async () => (await axiosClient.get("/operations/warranty-expiring", { params: { days: 30 } })).data as any[],
  });

  const bulkMutation = useMutation({
    mutationFn: () => axiosClient.post("/operations/bulk-status", { assetIds: selectedIds, status: bulkStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-assets-for-bulk"] });
      setSelectedIds([]);
    },
  });

  const runAlertsMutation = useMutation({
    mutationFn: async () => (await axiosClient.post("/operations/maintenance-alerts/run")).data,
    onSuccess: (data) => {
      setAlertResult(data);
      queryClient.invalidateQueries({ queryKey: ["mobile-warranty-expiring"] });
      queryClient.invalidateQueries({ queryKey: ["mobile-maintenance-due"] });
    },
  });

  function toggleSelected(id: number) {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function downloadReport(type: string, format: "csv" | "pdf") {
    setDownloading(`${type}-${format}`);
    try {
      await downloadAndShare(`/operations/reports/${type}`, `${type}-report.${format}`, { format });
    } catch {
      showToast({ variant: "error", title: "Download failed", message: "Could not generate the report. Try again." });
    } finally {
      setDownloading(null);
    }
  }

  const statusOptions: PickerOption[] = STATUS_OPTIONS.map((s) => ({ id: s, label: s.replace("_", " ") }));
  const sectionTitle = { color: colors.textMuted, fontSize: 11, fontWeight: "700" as const, textTransform: "uppercase" as const, marginBottom: 8 };
  const panel = { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={panel}>
        <Text style={sectionTitle}>Bulk Asset Status Update</Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
          <TouchableOpacity
            style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
            onPress={() => setStatusPickerOpen(true)}
          >
            <Text style={{ color: colors.text, fontSize: 12.5 }}>{bulkStatus.replace("_", " ")}</Text>
            <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={{ backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 14, justifyContent: "center", opacity: selectedIds.length ? 1 : 0.5 }}
            disabled={selectedIds.length === 0 || bulkMutation.isPending}
            onPress={() => bulkMutation.mutate()}
          >
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>Apply ({selectedIds.length})</Text>
          </TouchableOpacity>
        </View>
        <View style={{ maxHeight: 260 }}>
          <ScrollView nestedScrollEnabled>
            {assets?.map((a) => (
              <TouchableOpacity key={a.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }} onPress={() => toggleSelected(a.id)}>
                <Ionicons name={selectedIds.includes(a.id) ? "checkbox" : "square-outline"} size={18} color={selectedIds.includes(a.id) ? colors.primary : colors.textMuted} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "600" }}>{a.name}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 10.5 }}>{a.assetTag} · {String(a.status).replace("_", " ")}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      <View style={panel}>
        <Text style={sectionTitle}>Report Generator</Text>
        {REPORTS.map((r) => (
          <View key={r.type} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "600" }}>{r.label}</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["csv", "pdf"] as const).map((fmt) => (
                <TouchableOpacity key={fmt} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 4 }} onPress={() => downloadReport(r.type, fmt)}>
                  {downloading === `${r.type}-${fmt}` ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="download-outline" size={13} color={colors.text} />}
                  <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>{fmt.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </View>

      <View style={panel}>
        <Text style={sectionTitle}>Maintenance Due</Text>
        {dueAssets?.length ? (
          dueAssets.map((a) => (
            <View key={a.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "600" }}>{a.name} ({a.assetTag})</Text>
              <Text style={{ color: colors.textMuted, fontSize: 10.5 }}>Next service {dayjs(a.nextServiceDate).format("DD MMM YYYY")}</Text>
            </View>
          ))
        ) : (
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>No assets are currently due for maintenance.</Text>
        )}
      </View>

      <View style={panel}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <Text style={[sectionTitle, { marginBottom: 0 }]}>Warranty Expiring (30 days)</Text>
          <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} disabled={runAlertsMutation.isPending} onPress={() => runAlertsMutation.mutate()}>
            <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{runAlertsMutation.isPending ? "Running..." : "Run Check"}</Text>
          </TouchableOpacity>
        </View>
        {alertResult && (
          <View style={{ backgroundColor: colors.success + "22", borderRadius: radius.md, padding: 8, marginBottom: 10 }}>
            <Text style={{ color: colors.success, fontSize: 11 }}>
              Scan complete: {alertResult.warrantyAlerts} warranty alert(s), {alertResult.serviceAlerts} maintenance alert(s) raised.
            </Text>
          </View>
        )}
        {warrantyAssets?.length ? (
          warrantyAssets.map((a) => (
            <View key={a.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "600" }}>{a.name} ({a.assetTag})</Text>
              <Text style={{ color: colors.textMuted, fontSize: 10.5 }}>Warranty expires {dayjs(a.warrantyExpiresAt).format("DD MMM YYYY")}</Text>
            </View>
          ))
        ) : (
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>No warranties expiring in the next 30 days.</Text>
        )}
      </View>

      <PickerModal visible={statusPickerOpen} title="Bulk status" options={statusOptions} selectedId={bulkStatus} onSelect={(v) => setBulkStatus(v as string)} onClose={() => setStatusPickerOpen(false)} />
    </ScrollView>
  );
}

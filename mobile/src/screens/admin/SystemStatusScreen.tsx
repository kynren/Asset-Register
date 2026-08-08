import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { ShimmerListItem } from "../../components/Shimmer";

type StatusLevel = "OPERATIONAL" | "DEGRADED" | "OUTAGE";

interface ComponentStatus {
  key: string;
  name: string;
  currentStatus: StatusLevel | null;
  currentMessage: string | null;
  uptimePercent: number | null;
}

interface StatusResponse {
  overall: StatusLevel | "UNKNOWN";
  components: ComponentStatus[];
}

interface StatusSettings {
  checkIntervalMinutes: number;
}

const INTERVAL_PRESETS = [
  { value: 15, label: "15m" },
  { value: 30, label: "30m" },
  { value: 60, label: "1h" },
  { value: 180, label: "3h" },
  { value: 360, label: "6h" },
  { value: 720, label: "12h" },
  { value: 1440, label: "24h" },
];

// Mirrors client/src/pages/appSettings/SystemStatusTab.tsx — the per-day 90-bar uptime strip is
// dropped for the mobile version (too cramped on a phone screen); the numeric uptime % carries the
// same information at a glance.
export function SystemStatusScreen() {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("app-settings", "edit");
  const [intervalDraft, setIntervalDraft] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["mobile-system-status"],
    queryFn: async () => (await axiosClient.get<StatusResponse>("/system/status")).data,
    refetchInterval: 60000,
  });

  const { data: settings } = useQuery({
    queryKey: ["mobile-system-status-settings"],
    queryFn: async () => (await axiosClient.get<StatusSettings>("/system/status/settings")).data,
  });

  useEffect(() => {
    if (settings) setIntervalDraft(settings.checkIntervalMinutes);
  }, [settings]);

  const checkNowMutation = useMutation({
    mutationFn: () => axiosClient.post("/system/status/check-now"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["mobile-system-status"] }),
  });

  const saveIntervalMutation = useMutation({
    mutationFn: (checkIntervalMinutes: number) => axiosClient.put("/system/status/settings", { checkIntervalMinutes }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-system-status-settings"] }),
  });

  const BANNER: Record<StatusResponse["overall"], { label: string; bg: string }> = {
    OPERATIONAL: { label: "All Systems Operational", bg: colors.success },
    DEGRADED: { label: "Some Systems Degraded", bg: colors.warning },
    OUTAGE: { label: "System Outage", bg: colors.danger },
    UNKNOWN: { label: "Awaiting First Health Check", bg: colors.textMuted },
  };

  if (isLoading || !data) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}>
        <ShimmerListItem />
        <ShimmerListItem />
        <ShimmerListItem />
      </ScrollView>
    );
  }

  const banner = BANNER[data.overall];
  const intervalDirty = intervalDraft !== null && settings !== undefined && intervalDraft !== settings.checkIntervalMinutes;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: banner.bg, borderRadius: radius.md, padding: spacing.md }}>
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14, flex: 1 }}>{banner.label}</Text>
        <TouchableOpacity
          disabled={checkNowMutation.isPending}
          onPress={() => checkNowMutation.mutate()}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
        >
          {checkNowMutation.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="refresh" size={14} color="#fff" />}
          <Text style={{ color: "#fff", fontSize: 11.5, fontWeight: "700" }}>Check Now</Text>
        </TouchableOpacity>
      </View>

      <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700", marginBottom: 2 }}>Check interval</Text>
        <Text style={{ color: colors.textMuted, fontSize: 11.5, marginBottom: 10 }}>How often each component is automatically re-checked.</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: canEdit ? 10 : 0 }}>
          {INTERVAL_PRESETS.map((p) => {
            const active = intervalDraft === p.value;
            return (
              <TouchableOpacity
                key={p.value}
                disabled={!canEdit || !settings}
                onPress={() => setIntervalDraft(p.value)}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: active ? colors.primary : colors.bg, borderWidth: 1, borderColor: active ? colors.primary : colors.border }}
              >
                <Text style={{ color: active ? "#fff" : colors.text, fontSize: 12, fontWeight: "600" }}>{p.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {canEdit && (
          <TouchableOpacity
            disabled={!intervalDirty || saveIntervalMutation.isPending}
            onPress={() => intervalDraft !== null && saveIntervalMutation.mutate(intervalDraft)}
            style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 10, opacity: intervalDirty ? 1 : 0.5 }}
          >
            {saveIntervalMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Save</Text>}
          </TouchableOpacity>
        )}
      </View>

      <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
        {data.components.map((c) => {
          const pillColor = c.currentStatus === "OPERATIONAL" ? colors.success : c.currentStatus === "DEGRADED" ? colors.warning : c.currentStatus === "OUTAGE" ? colors.danger : colors.textMuted;
          const pillLabel = c.currentStatus === "OPERATIONAL" ? "Operational" : c.currentStatus === "DEGRADED" ? "Degraded" : c.currentStatus === "OUTAGE" ? "Outage" : "No data yet";
          return (
            <View key={c.key} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{c.name}</Text>
                <View style={{ backgroundColor: pillColor + "22", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: pillColor, fontSize: 10, fontWeight: "700" }}>{pillLabel}</Text>
                </View>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
                {c.uptimePercent !== null ? `${c.uptimePercent}% uptime (90 days)` : "No data yet"}
              </Text>
              {c.currentMessage && <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{c.currentMessage}</Text>}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

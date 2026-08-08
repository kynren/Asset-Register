import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { ShimmerList } from "../../components/Shimmer";
import { PickerModal, PickerOption } from "../../components/PickerModal";

interface AccessEvent {
  id: number;
  employeeNo: string | null;
  cardNumber: string | null;
  eventType: string;
  message: string | null;
  occurredAt: string;
  device: { id: number; name: string };
  door: { id: number; name: string } | null;
}
interface Device { id: number; name: string }

const TYPE_TONE: Record<string, "primary" | "muted" | "danger"> = { REMOTE_OPEN: "primary", REMOTE_CLOSE: "muted", REMOTE_CONTROL_ERROR: "danger" };

// Mirrors client/src/pages/accessControl/AccessEventLogTab.tsx.
export function AccessEventLogScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [deviceId, setDeviceId] = useState<number | null>(null);
  const [devicePickerOpen, setDevicePickerOpen] = useState(false);

  const { data: devices } = useQuery({ queryKey: ["mobile-access-control-devices-eventlog"], queryFn: async () => (await axiosClient.get("/access-control/devices")).data as Device[] });
  const { data: events, isLoading } = useQuery({
    queryKey: ["mobile-access-events", deviceId],
    queryFn: async () => (await axiosClient.get("/access-control/events", { params: deviceId ? { deviceId } : {} })).data as AccessEvent[],
    refetchInterval: 15_000,
  });

  const syncMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`/access-control/devices/${id}/sync-events`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-access-events"] }),
  });

  const deviceOptions: PickerOption[] = (devices ?? []).map((d) => ({ id: d.id, label: d.name }));
  const toneColor = (t: "primary" | "muted" | "danger") => (t === "primary" ? colors.primary : t === "danger" ? colors.danger : colors.textMuted);

  if (isLoading) return <ShimmerList />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: "row", gap: 8, padding: spacing.lg, paddingBottom: spacing.sm }}>
        <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.bg }} onPress={() => setDevicePickerOpen(true)}>
          <Text style={{ color: deviceId ? colors.text : colors.textMuted, fontSize: 13 }}>{deviceOptions.find((o) => o.id === deviceId)?.label ?? "All devices"}</Text>
        </TouchableOpacity>
        {hasPermission("access-control", "edit") && (
          <TouchableOpacity
            disabled={!deviceId || syncMutation.isPending}
            style={{ borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 14, justifyContent: "center", opacity: deviceId ? 1 : 0.5 }}
            onPress={() => deviceId && syncMutation.mutate(deviceId)}
          >
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>{syncMutation.isPending ? "Syncing..." : "Sync Now"}</Text>
          </TouchableOpacity>
        )}
      </View>

      {syncMutation.data && (
        <View style={{ marginHorizontal: spacing.lg, marginBottom: spacing.sm, backgroundColor: (syncMutation.data.data.ok ? colors.success : colors.danger) + "1a", borderRadius: radius.sm, padding: 8 }}>
          <Text style={{ color: syncMutation.data.data.ok ? colors.success : colors.danger, fontSize: 11 }}>{syncMutation.data.data.message}</Text>
        </View>
      )}

      <FlatList
        data={events ?? []}
        keyExtractor={(e) => String(e.id)}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.sm }}
        ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center" }}>No access events recorded yet — select a device and Sync Now to pull its history.</Text>}
        renderItem={({ item: e }) => {
          const tone = TYPE_TONE[e.eventType] ?? "muted";
          return (
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name={e.eventType === "REMOTE_OPEN" ? "lock-open-outline" : e.eventType === "REMOTE_CONTROL_ERROR" ? "alert-circle-outline" : "lock-closed-outline"} size={16} color={toneColor(tone)} />
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700", flex: 1 }}>{e.eventType.replace(/_/g, " ")}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{dayjs(e.occurredAt).format("DD MMM, HH:mm:ss")}</Text>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 4 }}>
                {e.device.name}{e.door ? ` · ${e.door.name}` : ""} · {e.cardNumber ?? e.employeeNo ?? "—"}
              </Text>
              {e.message && <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 2 }}>{e.message}</Text>}
            </View>
          );
        }}
      />

      <PickerModal visible={devicePickerOpen} title="Device" options={deviceOptions} selectedId={deviceId} allowClear onSelect={(id) => setDeviceId(id as number | null)} onClose={() => setDevicePickerOpen(false)} />
    </View>
  );
}

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlatList, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { ShimmerList } from "../../components/Shimmer";
import { useToast } from "../../components/toast/ToastProvider";

type ChangeType = "SYSTEM_SETTINGS" | "BACKUP_SETTINGS" | "ROLE_PERMISSIONS";
type ChangeStatus = "PENDING" | "PUBLISHED" | "CANCELLED" | "FAILED";

interface ScheduledChangeRow {
  id: number;
  changeType: ChangeType;
  status: ChangeStatus;
  summary: string;
  payload: any;
  beforeSnapshot: any;
  scheduledFor: string;
  publishedAt: string | null;
  cancelledAt: string | null;
  errorMessage: string | null;
}

const TYPE_LABEL: Record<ChangeType, string> = {
  SYSTEM_SETTINGS: "System Settings",
  BACKUP_SETTINGS: "Backup Schedule",
  ROLE_PERMISSIONS: "Role Permissions",
};

// Diffs every top-level payload key against beforeSnapshot generically rather than the web
// version's 3 type-specific diff renderers (SettingsDiff/BackupDiff/RolePermissionsDiff) — a plain
// key/value list carries the same "what changed" information on a phone-sized detail sheet without
// reproducing that much per-type rendering logic.
function flatten(obj: any, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  if (obj == null) return out;
  if (Array.isArray(obj)) {
    out[prefix || "value"] = JSON.stringify(obj);
    return out;
  }
  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) Object.assign(out, flatten(v, prefix ? `${prefix}.${k}` : k));
    return out;
  }
  out[prefix || "value"] = String(obj);
  return out;
}

function statusColor(status: ChangeStatus, colors: any) {
  return status === "PENDING" ? colors.warning : status === "PUBLISHED" ? colors.success : status === "FAILED" ? colors.danger : colors.textMuted;
}

function ChangeDetailModal({ change, onClose }: { change: ScheduledChangeRow; onClose: () => void }) {
  const { colors, spacing, radius } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [rescheduling, setRescheduling] = useState(false);
  const [dateStr, setDateStr] = useState(dayjs(change.scheduledFor).format("YYYY-MM-DD"));
  const [timeStr, setTimeStr] = useState(dayjs(change.scheduledFor).format("HH:mm"));

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["mobile-scheduled-changes"] });
  }

  const publishNowMutation = useMutation({
    mutationFn: () => axiosClient.post(`/scheduled-changes/${change.id}/publish-now`),
    onSuccess: () => { showToast({ variant: "success", title: "Change published" }); invalidate(); onClose(); },
  });
  const cancelMutation = useMutation({
    mutationFn: () => axiosClient.post(`/scheduled-changes/${change.id}/cancel`),
    onSuccess: () => { showToast({ variant: "success", title: "Change cancelled" }); invalidate(); onClose(); },
  });
  const rescheduleMutation = useMutation({
    mutationFn: () => axiosClient.patch(`/scheduled-changes/${change.id}`, { scheduledFor: dayjs(`${dateStr}T${timeStr}`).toISOString() }),
    onSuccess: () => { showToast({ variant: "success", title: "Rescheduled" }); invalidate(); onClose(); },
  });

  const before = flatten(change.beforeSnapshot);
  const after = flatten(change.payload);
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
  const isPending = change.status === "PENDING";
  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: colors.text, backgroundColor: colors.surface };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>{TYPE_LABEL[change.changeType]}</Text>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={colors.textMuted} /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ backgroundColor: statusColor(change.status, colors) + "22", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ color: statusColor(change.status, colors), fontSize: 10.5, fontWeight: "700" }}>{change.status}</Text>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}>{change.summary}</Text>
          </View>

          <View style={{ flexDirection: "row", gap: 16 }}>
            <View>
              <Text style={{ color: colors.textMuted, fontSize: 10.5 }}>Scheduled for</Text>
              <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "700" }}>{dayjs(change.scheduledFor).format("DD MMM YYYY, HH:mm")}</Text>
            </View>
            {change.publishedAt && (
              <View>
                <Text style={{ color: colors.textMuted, fontSize: 10.5 }}>Published at</Text>
                <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "700" }}>{dayjs(change.publishedAt).format("DD MMM YYYY, HH:mm")}</Text>
              </View>
            )}
            {change.cancelledAt && (
              <View>
                <Text style={{ color: colors.textMuted, fontSize: 10.5 }}>Cancelled at</Text>
                <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "700" }}>{dayjs(change.cancelledAt).format("DD MMM YYYY, HH:mm")}</Text>
              </View>
            )}
          </View>

          {change.status === "FAILED" && change.errorMessage && (
            <View style={{ backgroundColor: colors.danger + "18", borderRadius: radius.md, padding: 10 }}>
              <Text style={{ color: colors.danger, fontSize: 12 }}>{change.errorMessage}</Text>
            </View>
          )}

          <View>
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700", marginBottom: 6 }}>Changes</Text>
            {keys.length === 0 && <Text style={{ color: colors.textMuted, fontSize: 12 }}>No values recorded.</Text>}
            {keys.map((k) => {
              const changed = (before[k] ?? "") !== (after[k] ?? "");
              return (
                <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ color: colors.text, fontSize: 11.5, fontWeight: "600", flex: 1 }}>{k}</Text>
                  <View style={{ flex: 1, alignItems: "flex-end" }}>
                    {changed ? (
                      <>
                        <Text style={{ color: colors.textMuted, fontSize: 11, textDecorationLine: "line-through" }}>{before[k] ?? "—"}</Text>
                        <Text style={{ color: colors.text, fontSize: 11.5, fontWeight: "700" }}>{after[k] ?? "—"}</Text>
                      </>
                    ) : (
                      <Text style={{ color: colors.text, fontSize: 11.5 }}>{after[k] ?? "—"}</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          {isPending && rescheduling && (
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>New scheduled time</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput style={[inputStyle, { flex: 1 }]} value={dateStr} onChangeText={setDateStr} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} />
                <TextInput style={[inputStyle, { flex: 1 }]} value={timeStr} onChangeText={setTimeStr} placeholder="HH:mm" placeholderTextColor={colors.textMuted} />
              </View>
              <TouchableOpacity
                style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 10 }}
                disabled={rescheduleMutation.isPending}
                onPress={() => rescheduleMutation.mutate()}
              >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{rescheduleMutation.isPending ? "Saving..." : "Confirm"}</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        {isPending && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border }}>
            <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 }} disabled={cancelMutation.isPending} onPress={() => cancelMutation.mutate()}>
              <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "700" }}>Cancel Change</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 }} onPress={() => setRescheduling((r) => !r)}>
              <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>Reschedule</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 }} disabled={publishNowMutation.isPending} onPress={() => publishNowMutation.mutate()}>
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>{publishNowMutation.isPending ? "Publishing..." : "Publish Now"}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

// Mirrors client/src/pages/appSettings/ChangeManagementTab.tsx's timeline. "Edit" (jump back to the
// originating System Settings/Backups/Roles form pre-filled) is left out — cancel + reschedule +
// publish-now cover the actionable workflow; editing a pending change's values is still possible by
// scheduling a fresh one from that screen.
export function ChangeManagementListScreen() {
  const { colors, spacing, radius } = useTheme();
  const [selected, setSelected] = useState<ScheduledChangeRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["mobile-scheduled-changes"],
    queryFn: async () => (await axiosClient.get("/scheduled-changes")).data as ScheduledChangeRow[],
    refetchInterval: 30000,
  });

  if (isLoading) return <ShimmerList />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={data ?? []}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        ListEmptyComponent={
          <Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 40, paddingHorizontal: 20 }}>
            No scheduled or past changes yet for this organization. Changes you publish or schedule from System Settings, Backups, or Roles &amp; Permissions will show up here.
          </Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => setSelected(item)}
            style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: statusColor(item.status, colors) }} />
              <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: "700", textTransform: "uppercase" }}>{TYPE_LABEL[item.changeType]}</Text>
              <View style={{ backgroundColor: statusColor(item.status, colors) + "22", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, marginLeft: "auto" }}>
                <Text style={{ color: statusColor(item.status, colors), fontSize: 9.5, fontWeight: "700" }}>{item.status}</Text>
              </View>
            </View>
            <Text style={{ color: colors.text, fontSize: 12.5, marginTop: 6 }}>{item.summary}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 10.5, marginTop: 4 }}>
              {item.status === "PENDING"
                ? `Scheduled for ${dayjs(item.scheduledFor).format("DD MMM YYYY, HH:mm")}`
                : item.status === "PUBLISHED" && item.publishedAt
                ? `Published ${dayjs(item.publishedAt).format("DD MMM YYYY, HH:mm")}`
                : item.status === "CANCELLED" && item.cancelledAt
                ? `Cancelled ${dayjs(item.cancelledAt).format("DD MMM YYYY, HH:mm")}`
                : ""}
            </Text>
          </TouchableOpacity>
        )}
      />
      {selected && <ChangeDetailModal change={selected} onClose={() => setSelected(null)} />}
    </View>
  );
}

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { KeyboardAvoidingScreen } from "../../components/KeyboardAvoidingScreen";

dayjs.extend(relativeTime);

interface MonitorRange { startIp: string; endIp: string; label?: string }
interface MonitorSettings { id: number; enabled: boolean; intervalMinutes: number; ranges: MonitorRange[]; notifyUserIds: number[]; notifyEmails: string[]; lastRunAt: string | null }
interface DirectoryUser { id: number; firstName: string; lastName: string; email: string }
interface DiscoveredSubnet { id: number; cidr: string; label: string | null; lastSeenAt: string }

function cidrToRange(cidr: string): { startIp: string; endIp: string } | null {
  const [base, prefixStr] = cidr.split("/");
  const prefix = Number(prefixStr);
  const parts = (base ?? "").split(".").map(Number);
  if (Number.isNaN(prefix) || prefix < 0 || prefix > 32 || parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return null;
  const baseInt = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  const hostBits = 32 - prefix;
  const mask = hostBits === 0 ? 0xffffffff : (0xffffffff << hostBits) >>> 0;
  const network = baseInt & mask;
  const broadcast = hostBits === 0 ? network : (network | (~mask >>> 0)) >>> 0;
  const toIp = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
  const startInt = hostBits > 1 ? network + 1 : network;
  const endInt = hostBits > 1 ? broadcast - 1 : broadcast;
  return { startIp: toIp(startInt), endIp: toIp(endInt) };
}

// Mirrors client/src/pages/network/MonitoringTab.tsx's settings + discovered-subnets sections —
// the device list itself lives on NetworkListScreen, and per-device SNMP config/detail lives on
// NetworkDeviceDetailScreen.
export function MonitorSettingsScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = hasPermission("network", "edit");

  const [draft, setDraft] = useState<{ enabled: boolean; intervalMinutes: number; ranges: MonitorRange[]; notifyUserIds: number[]; notifyEmails: string[] } | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [showUsers, setShowUsers] = useState(false);

  const { data: settings } = useQuery({ queryKey: ["mobile-network-monitor-settings"], queryFn: async () => (await axiosClient.get("/network/monitor/settings")).data as MonitorSettings });
  const { data: discoveredSubnets } = useQuery({ queryKey: ["mobile-network-discovered-subnets"], queryFn: async () => (await axiosClient.get("/network/discovered-subnets")).data as DiscoveredSubnet[] });
  const { data: directory } = useQuery({ queryKey: ["mobile-users-directory-monitor"], queryFn: async () => (await axiosClient.get("/users/directory")).data as DirectoryUser[] });

  useEffect(() => {
    if (settings && !draft) setDraft({ enabled: settings.enabled, intervalMinutes: settings.intervalMinutes, ranges: settings.ranges ?? [], notifyUserIds: settings.notifyUserIds ?? [], notifyEmails: settings.notifyEmails ?? [] });
  }, [settings, draft]);

  const saveMutation = useMutation({
    mutationFn: (payload: typeof draft) => axiosClient.put("/network/monitor/settings", payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-network-monitor-settings"] }),
  });
  const runNowMutation = useMutation({
    mutationFn: () => axiosClient.post("/network/monitor/run-now"),
    onSuccess: () => setTimeout(() => { queryClient.invalidateQueries({ queryKey: ["mobile-network-devices"] }); queryClient.invalidateQueries({ queryKey: ["mobile-network-monitor-settings"] }); }, 3000),
  });

  function addRange() { if (draft) setDraft({ ...draft, ranges: [...draft.ranges, { startIp: "", endIp: "", label: "" }] }); }
  function updateRange(i: number, patch: Partial<MonitorRange>) { if (draft) setDraft({ ...draft, ranges: draft.ranges.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) }); }
  function removeRange(i: number) { if (draft) setDraft({ ...draft, ranges: draft.ranges.filter((_, idx) => idx !== i) }); }
  function toggleNotifyUser(userId: number) {
    if (!draft) return;
    const has = draft.notifyUserIds.includes(userId);
    setDraft({ ...draft, notifyUserIds: has ? draft.notifyUserIds.filter((id) => id !== userId) : [...draft.notifyUserIds, userId] });
  }
  function addNotifyEmail() {
    if (!draft) return;
    const email = newEmail.trim().toLowerCase();
    if (!email || draft.notifyEmails.includes(email)) return;
    setDraft({ ...draft, notifyEmails: [...draft.notifyEmails, email] });
    setNewEmail("");
  }
  function removeNotifyEmail(email: string) { if (draft) setDraft({ ...draft, notifyEmails: draft.notifyEmails.filter((e) => e !== email) }); }
  function subnetRangeIndex(s: DiscoveredSubnet): number {
    if (!draft) return -1;
    const range = cidrToRange(s.cidr);
    if (!range) return -1;
    return draft.ranges.findIndex((r) => r.startIp === range.startIp && r.endIp === range.endIp);
  }
  function addSubnetAsRange(s: DiscoveredSubnet) {
    if (!draft) return;
    const range = cidrToRange(s.cidr);
    if (!range) return;
    setDraft({ ...draft, ranges: [...draft.ranges, { ...range, label: s.label ?? s.cidr }] });
  }
  function removeSubnetRange(s: DiscoveredSubnet) {
    if (!draft) return;
    const idx = subnetRangeIndex(s);
    if (idx === -1) return;
    setDraft({ ...draft, ranges: draft.ranges.filter((_, i) => i !== idx) });
  }

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: colors.text, backgroundColor: colors.bg };
  const panel = { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md };

  if (!draft) return null;

  return (
    <KeyboardAvoidingScreen>
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
        <View style={panel}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>Continuous Monitoring</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 2, marginBottom: spacing.md }}>
            Periodically re-scans the ranges below, tracks each device's online/offline history, and alerts on real status changes.
          </Text>

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm }}>
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>Enabled</Text>
            <Switch value={draft.enabled} onValueChange={(v) => setDraft({ ...draft, enabled: v })} trackColor={{ true: colors.primary, false: colors.border }} disabled={!canEdit} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.sm }}>
            <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>Re-scan every</Text>
            <TextInput style={[inputStyle, { width: 60, textAlign: "center" }]} keyboardType="number-pad" value={String(draft.intervalMinutes)} onChangeText={(v) => setDraft({ ...draft, intervalMinutes: Number(v) || 1 })} editable={canEdit} />
            <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>minutes</Text>
          </View>
          {settings?.lastRunAt && <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: spacing.sm }}>Last run: {dayjs(settings.lastRunAt).fromNow()}</Text>}

          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginBottom: 6 }}>Ranges</Text>
          {draft.ranges.map((r, i) => (
            <View key={i} style={{ gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 8, marginBottom: 6 }}>
              <TextInput style={inputStyle} placeholder="Start IP" placeholderTextColor={colors.textMuted} value={r.startIp} onChangeText={(v) => updateRange(i, { startIp: v })} editable={canEdit} autoCapitalize="none" />
              <TextInput style={inputStyle} placeholder="End IP" placeholderTextColor={colors.textMuted} value={r.endIp} onChangeText={(v) => updateRange(i, { endIp: v })} editable={canEdit} autoCapitalize="none" />
              <TextInput style={inputStyle} placeholder="Label (optional)" placeholderTextColor={colors.textMuted} value={r.label ?? ""} onChangeText={(v) => updateRange(i, { label: v })} editable={canEdit} />
              {canEdit && (
                <TouchableOpacity style={{ alignSelf: "flex-end" }} onPress={() => removeRange(i)}>
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                </TouchableOpacity>
              )}
            </View>
          ))}
          {canEdit && (
            <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: spacing.md }} onPress={addRange}>
              <Ionicons name="add" size={14} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>Add Range</Text>
            </TouchableOpacity>
          )}

          <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700", marginBottom: 4 }}>Alert Delivery</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: spacing.sm }}>Only the users/addresses below are notified on a status change.</Text>
          <TouchableOpacity style={[inputStyle, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]} onPress={() => setShowUsers((v) => !v)}>
            <Text style={{ color: colors.text, fontSize: 13 }}>Notify Users ({draft.notifyUserIds.length} selected)</Text>
            <Ionicons name={showUsers ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} />
          </TouchableOpacity>
          {showUsers && (
            <View style={{ maxHeight: 180, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, marginTop: 6 }}>
              <ScrollView nestedScrollEnabled>
                {(directory ?? []).map((u) => (
                  <TouchableOpacity key={u.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 8 }} onPress={() => canEdit && toggleNotifyUser(u.id)}>
                    <Ionicons name={draft.notifyUserIds.includes(u.id) ? "checkbox" : "square-outline"} size={18} color={draft.notifyUserIds.includes(u.id) ? colors.primary : colors.textMuted} />
                    <Text style={{ color: colors.text, fontSize: 12.5 }}>{u.firstName} {u.lastName} <Text style={{ color: colors.textMuted }}>({u.email})</Text></Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginTop: spacing.sm, marginBottom: 6 }}>Notify Emails</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
            {draft.notifyEmails.map((email) => (
              <View key={email} style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ color: colors.text, fontSize: 11 }}>{email}</Text>
                {canEdit && (
                  <TouchableOpacity onPress={() => removeNotifyEmail(email)}>
                    <Ionicons name="close" size={12} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
          {canEdit && (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput style={[inputStyle, { flex: 1 }]} placeholder="name@example.com" placeholderTextColor={colors.textMuted} value={newEmail} onChangeText={setNewEmail} autoCapitalize="none" />
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, justifyContent: "center" }} onPress={addNotifyEmail}>
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12 }}>Add</Text>
              </TouchableOpacity>
            </View>
          )}

          {canEdit && (
            <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.md }}>
              <TouchableOpacity style={{ flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12 }} disabled={saveMutation.isPending} onPress={() => saveMutation.mutate(draft)}>
                {saveMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Save Settings</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, opacity: draft.ranges.length === 0 ? 0.5 : 1 }} disabled={runNowMutation.isPending || draft.ranges.length === 0} onPress={() => runNowMutation.mutate()}>
                {runNowMutation.isPending ? <ActivityIndicator color={colors.text} /> : <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>Run Now</Text>}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {discoveredSubnets && discoveredSubnets.length > 0 && (
          <View style={panel}>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>Subnets Detected by Relay</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2, marginBottom: spacing.sm }}>Purely informational — nothing here is added to the ranges above automatically.</Text>
            {discoveredSubnets.map((s) => {
              const inRange = subnetRangeIndex(s) !== -1;
              return (
                <View key={s.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 12.5, fontFamily: "monospace" }}>{s.cidr}{s.label ? ` — ${s.label}` : ""}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 10.5, marginTop: 1 }}>seen {dayjs(s.lastSeenAt).fromNow()}</Text>
                  </View>
                  {canEdit && (
                    <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 8, paddingVertical: 5 }} onPress={() => (inRange ? removeSubnetRange(s) : addSubnetAsRange(s))}>
                      <Text style={{ color: colors.text, fontSize: 10.5, fontWeight: "700" }}>{inRange ? "Remove from Range" : "Add as Range"}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingScreen>
  );
}

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute, RouteProp } from "@react-navigation/native";
import { ActivityIndicator, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { ShimmerDetail } from "../../components/Shimmer";
import { MonitoredNetworkDevice, PingResult } from "../../types/network";
import { MoreStackParamList } from "../../navigation/types";

export function NetworkDeviceDetailScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const route = useRoute<RouteProp<MoreStackParamList, "NetworkDeviceDetail">>();
  const { id } = route.params;

  const [pinging, setPinging] = useState(false);
  const [pingResult, setPingResult] = useState<PingResult | null>(null);
  const [snmpSheetOpen, setSnmpSheetOpen] = useState(false);
  const [snmpDetailOpen, setSnmpDetailOpen] = useState(false);
  const [snmpEnabledDraft, setSnmpEnabledDraft] = useState(true);
  const [snmpCommunity, setSnmpCommunity] = useState("");
  const [snmpPort, setSnmpPort] = useState(161);

  const { data: devices, isLoading } = useQuery({
    queryKey: ["mobile-network-devices"],
    queryFn: async () => (await axiosClient.get("/network/monitor/devices")).data as MonitoredNetworkDevice[],
  });
  const device = devices?.find((d) => d.id === id);

  const snmpMutation = useMutation({
    mutationFn: () => axiosClient.post(`/network/monitor/devices/${id}/snmp`, { snmpEnabled: snmpEnabledDraft, snmpCommunity: snmpCommunity || undefined, snmpPort }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["mobile-network-devices"] }); setSnmpSheetOpen(false); setSnmpCommunity(""); },
  });

  function openSnmpSheet() {
    setSnmpEnabledDraft(true);
    setSnmpCommunity("");
    setSnmpPort(device?.snmpPort || 161);
    setSnmpSheetOpen(true);
  }

  async function runPing() {
    if (!device) return;
    setPinging(true);
    setPingResult(null);
    try {
      const res = await axiosClient.post("/network/ping", { ipAddress: device.ipAddress });
      setPingResult(res.data as PingResult);
    } catch {
      setPingResult({ alive: false });
    } finally {
      setPinging(false);
    }
  }

  if (isLoading || !device) {
    return <ShimmerDetail />;
  }

  const rows: [string, string | null][] = [
    ["IP address", device.ipAddress],
    ["MAC address", device.macAddress],
    ["Vendor", device.vendor],
    ["Device type", device.deviceType],
    ["Operating system", device.os],
    ["Logged-in user", device.loggedInUser],
    ["SNMP", device.snmpEnabled ? (device.snmpConfigured ? "Enabled" : "Enabled (not configured)") : "Disabled"],
    ["SNMP system name", device.snmpSysName],
    ["First seen", dayjs(device.firstSeenAt).format("DD MMM YYYY HH:mm")],
    ["Last seen", dayjs(device.lastSeenAt).format("DD MMM YYYY HH:mm")],
    ["Status changed", dayjs(device.lastChangedAt).format("DD MMM YYYY HH:mm")],
  ];

  return (
    <View style={{ flex: 1 }}>
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          padding: spacing.lg,
          marginBottom: spacing.lg,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: device.status === "ONLINE" ? colors.success : colors.danger }} />
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: "800" }}>{device.hostname ?? device.ipAddress}</Text>
        </View>
        <Text style={{ color: device.status === "ONLINE" ? colors.success : colors.danger, fontSize: 12, fontWeight: "700", marginTop: 4 }}>
          {device.status === "ONLINE" ? "Online" : "Offline"}
        </Text>
      </View>

      <TouchableOpacity
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          backgroundColor: colors.primary,
          borderRadius: radius.md,
          paddingVertical: 13,
          marginBottom: spacing.lg,
          opacity: pinging ? 0.7 : 1,
        }}
        onPress={runPing}
        disabled={pinging}
      >
        {pinging ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="radio-outline" size={16} color="#fff" />}
        <Text style={{ color: "#fff", fontWeight: "700" }}>{pinging ? "Pinging…" : "Ping now"}</Text>
      </TouchableOpacity>

      {pingResult && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            backgroundColor: (pingResult.alive ? colors.success : colors.danger) + "1a",
            borderRadius: radius.md,
            padding: spacing.md,
            marginBottom: spacing.lg,
          }}
        >
          <Ionicons
            name={pingResult.alive ? "checkmark-circle" : "close-circle"}
            size={18}
            color={pingResult.alive ? colors.success : colors.danger}
          />
          <Text style={{ color: pingResult.alive ? colors.success : colors.danger, fontWeight: "700", fontSize: 13 }}>
            {pingResult.alive ? `Reply in ${pingResult.responseTimeMs ?? "?"} ms` : "No reply (timed out)"}
          </Text>
        </View>
      )}

      <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg }}>
        {rows
          .filter(([, v]) => v !== null)
          .map(([label, value], i, arr) => (
            <View
              key={label}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                paddingVertical: 12,
                borderBottomWidth: i < arr.length - 1 ? 1 : 0,
                borderBottomColor: colors.border,
              }}
            >
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{label}</Text>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{value}</Text>
            </View>
          ))}
      </View>

      {hasPermission("network", "edit") && (
        <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.lg }}>
          <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: "center", paddingVertical: 12 }} onPress={openSnmpSheet}>
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12.5 }}>{device.snmpEnabled ? "Reconfigure SNMP" : "Enable SNMP"}</Text>
          </TouchableOpacity>
          {device.snmpEnabled && device.snmpLastPolledAt && (
            <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: "center", paddingVertical: 12 }} onPress={() => setSnmpDetailOpen(true)}>
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12.5 }}>SNMP Detail</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </ScrollView>

      {snmpSheetOpen && (
        <View style={{ position: "absolute", inset: 0, backgroundColor: "#0008", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>SNMP Configuration</Text>
              <TouchableOpacity onPress={() => setSnmpSheetOpen(false)}><Ionicons name="close" size={22} color={colors.textMuted} /></TouchableOpacity>
            </View>
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ color: colors.text, fontSize: 13 }}>Enable SNMP polling for this device</Text>
                <Switch value={snmpEnabledDraft} onValueChange={setSnmpEnabledDraft} trackColor={{ true: colors.primary, false: colors.border }} />
              </View>
              <TextInput
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.bg }}
                placeholder="Community string (e.g. public)"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                value={snmpCommunity}
                onChangeText={setSnmpCommunity}
                autoCapitalize="none"
              />
              <TextInput
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.bg }}
                placeholder="Port"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                value={String(snmpPort)}
                onChangeText={(v) => setSnmpPort(Number(v) || 161)}
              />
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.md }}>
              <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: "center", paddingVertical: 12 }} onPress={() => setSnmpSheetOpen(false)}>
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12.5 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12 }} disabled={snmpMutation.isPending} onPress={() => snmpMutation.mutate()}>
                {snmpMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {snmpDetailOpen && (
        <View style={{ position: "absolute", inset: 0, backgroundColor: "#0008", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, maxHeight: "85%" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }} numberOfLines={1}>{device.snmpSysName || device.hostname || device.ipAddress}</Text>
                {device.snmpSysDescr && <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={2}>{device.snmpSysDescr}</Text>}
              </View>
              <TouchableOpacity onPress={() => setSnmpDetailOpen(false)}><Ionicons name="close" size={22} color={colors.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView>
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginBottom: 4 }}>Interfaces</Text>
              {(device.snmpInterfaces ?? []).length === 0 ? (
                <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.md }}>No interface data returned.</Text>
              ) : (
                device.snmpInterfaces!.map((iface) => (
                  <View key={iface.index} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <Text style={{ color: colors.text, fontSize: 12 }}>{iface.name}</Text>
                    <Text style={{ color: iface.operStatus === "up" ? colors.success : colors.textMuted, fontSize: 11, fontWeight: "700" }}>{iface.operStatus}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>{iface.speedMbps ? `${iface.speedMbps} Mbps` : "—"}</Text>
                  </View>
                ))
              )}

              {device.snmpLldpNeighbors && device.snmpLldpNeighbors.length > 0 && (
                <>
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginTop: spacing.md, marginBottom: 4 }}>LLDP / CDP Neighbors</Text>
                  {device.snmpLldpNeighbors.map((n, i) => (
                    <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      <Text style={{ color: colors.text, fontSize: 12 }}>Port {n.localPort ?? "—"}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 11, flex: 1, textAlign: "right" }} numberOfLines={1}>{n.remoteSysName || n.remoteChassisId || "unknown"}{n.remotePortId ? ` (${n.remotePortId})` : ""}</Text>
                    </View>
                  ))}
                </>
              )}

              {device.snmpMacTable && device.snmpMacTable.length > 0 && (
                <>
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginTop: spacing.md, marginBottom: 4 }}>MAC Address Table ({device.snmpMacTable.length})</Text>
                  {device.snmpMacTable.slice(0, 30).map((m, i) => (
                    <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 }}>
                      <Text style={{ color: colors.text, fontSize: 11, fontFamily: "monospace" }}>{m.mac}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 11 }}>port {m.port}</Text>
                    </View>
                  ))}
                </>
              )}

              {device.snmpVlans && device.snmpVlans.length > 0 && (
                <>
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginTop: spacing.md, marginBottom: 4 }}>VLANs</Text>
                  {device.snmpVlans.map((v, i) => (
                    <Text key={i} style={{ color: colors.text, fontSize: 12, paddingVertical: 2 }}>{v.vlanId} — {v.name || "unnamed"}</Text>
                  ))}
                </>
              )}

              {device.snmpPoeStatus && device.snmpPoeStatus.length > 0 && (
                <>
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginTop: spacing.md, marginBottom: 4 }}>PoE</Text>
                  {device.snmpPoeStatus.map((p, i) => (
                    <View key={i} style={{ flexDirection: "row", gap: 8, paddingVertical: 3 }}>
                      <Text style={{ color: colors.text, fontSize: 12 }}>Port {p.port}</Text>
                      <Text style={{ color: p.status === "delivering" ? colors.success : colors.textMuted, fontSize: 11, fontWeight: "700" }}>{p.status}</Text>
                    </View>
                  ))}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, RouteProp } from "@react-navigation/native";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { ShimmerDetail } from "../../components/Shimmer";
import { MonitoredNetworkDevice, PingResult } from "../../types/network";
import { MoreStackParamList } from "../../navigation/types";

export function NetworkDeviceDetailScreen() {
  const { colors, spacing, radius } = useTheme();
  const route = useRoute<RouteProp<MoreStackParamList, "NetworkDeviceDetail">>();
  const { id } = route.params;

  const [pinging, setPinging] = useState(false);
  const [pingResult, setPingResult] = useState<PingResult | null>(null);

  const { data: devices, isLoading } = useQuery({
    queryKey: ["mobile-network-devices"],
    queryFn: async () => (await axiosClient.get("/network/monitor/devices")).data as MonitoredNetworkDevice[],
  });
  const device = devices?.find((d) => d.id === id);

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
    </ScrollView>
  );
}

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { ShimmerList } from "../../components/Shimmer";
import { MonitoredNetworkDevice, NetworkMonitorSummary } from "../../types/network";
import { MoreStackParamList } from "../../navigation/types";

type StatusFilter = "ALL" | "ONLINE" | "OFFLINE";

// Port of the web app's Network Topology Map "Monitoring" tab — the continuously-monitored
// device set (GET /network/monitor/devices) as a searchable, filterable list, same pattern as
// Asset Inventory / Stock Register. The "Topology Graph" tab's interactive node/edge map lives on
// its own screen (NetworkGraphScreen), reachable via the button below.
export function NetworkListScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const devicesQuery = useQuery({
    queryKey: ["mobile-network-devices"],
    queryFn: async () => (await axiosClient.get("/network/monitor/devices")).data as MonitoredNetworkDevice[],
  });

  const summaryQuery = useQuery({
    queryKey: ["mobile-network-summary"],
    queryFn: async () => (await axiosClient.get("/network/monitor/summary")).data as NetworkMonitorSummary,
  });

  const devices = devicesQuery.data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return devices.filter((d) => {
      if (statusFilter !== "ALL" && d.status !== statusFilter) return false;
      if (!q) return true;
      return (
        d.hostname?.toLowerCase().includes(q) ||
        d.ipAddress.toLowerCase().includes(q) ||
        d.macAddress?.toLowerCase().includes(q) ||
        d.vendor?.toLowerCase().includes(q)
      );
    });
  }, [devices, search, statusFilter]);

  const summary = summaryQuery.data;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm }}>
        {summary && (
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <SummaryTile label="Online" value={summary.monitored.online} color={colors.success} />
            <SummaryTile label="Offline" value={summary.monitored.offline} color={colors.danger} />
            <SummaryTile label="Subnets" value={summary.subnetCount} color={colors.primary} />
          </View>
        )}

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <TouchableOpacity
            style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.primary + "1a", borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, paddingVertical: 10 }}
            onPress={() => navigation.navigate("NetworkGraph")}
          >
            <Ionicons name="git-network-outline" size={16} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12.5 }}>Topology Graph</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.primary + "1a", borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, paddingVertical: 10 }}
            onPress={() => navigation.navigate("PingConsole")}
          >
            <Ionicons name="pulse-outline" size={16} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12.5 }}>ICMP Pinger</Text>
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <TouchableOpacity
            style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.primary + "1a", borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, paddingVertical: 10 }}
            onPress={() => navigation.navigate("IpRangeScanner")}
          >
            <Ionicons name="radio-outline" size={16} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12.5 }}>IP Range Scanner</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.primary + "1a", borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, paddingVertical: 10 }}
            onPress={() => navigation.navigate("Switching")}
          >
            <Ionicons name="swap-horizontal-outline" size={16} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12.5 }}>Switching</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.primary + "1a", borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, paddingVertical: 10 }}
          onPress={() => navigation.navigate("MonitorSettings")}
        >
          <Ionicons name="options-outline" size={16} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12.5 }}>Monitor Settings & Discovered Subnets</Text>
        </TouchableOpacity>

        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md }]}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            style={{ flex: 1, marginLeft: 8, color: colors.text }}
            placeholder="Search hostname, IP, MAC, vendor..."
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {(["ALL", "ONLINE", "OFFLINE"] as StatusFilter[]).map((f) => (
            <TouchableOpacity
              key={f}
              onPress={() => setStatusFilter(f)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: radius.pill,
                backgroundColor: statusFilter === f ? colors.primary : colors.surface,
                borderWidth: 1,
                borderColor: statusFilter === f ? colors.primary : colors.border,
              }}
            >
              <Text style={{ color: statusFilter === f ? "#fff" : colors.text, fontSize: 12.5, fontWeight: "600" }}>
                {f === "ALL" ? "All" : f === "ONLINE" ? "Online" : "Offline"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {devicesQuery.isLoading ? (
        <ShimmerList />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.sm }}
          refreshControl={
            <RefreshControl
              refreshing={devicesQuery.isRefetching}
              onRefresh={() => {
                devicesQuery.refetch();
                summaryQuery.refetch();
              }}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 40 }}>No devices found.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}
              onPress={() => navigation.navigate("NetworkDeviceDetail", { id: item.id })}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.status === "ONLINE" ? colors.success : colors.danger }} />
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{item.hostname ?? item.ipAddress}</Text>
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                    {item.ipAddress}
                    {item.macAddress ? ` · ${item.macAddress}` : ""}
                  </Text>
                  {(item.vendor || item.deviceType) && (
                    <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                      {[item.vendor, item.deviceType].filter(Boolean).join(" · ")}
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

function SummaryTile({ label, value, color }: { label: string; value: number; color: string }) {
  const { radius, spacing } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: color + "1a", borderRadius: radius.md, padding: spacing.sm, alignItems: "center" }}>
      <Text style={{ color, fontSize: 18, fontWeight: "800" }}>{value}</Text>
      <Text style={{ color, fontSize: 10.5, fontWeight: "700", marginTop: 1 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  searchBox: { flexDirection: "row", alignItems: "center", borderWidth: 1, paddingHorizontal: 12, height: 42 },
});

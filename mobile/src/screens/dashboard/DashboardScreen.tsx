import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { axiosClient } from "../../api/axiosClient";
import { useAuth } from "../../auth/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { HomeStackParamList } from "../../navigation/types";

dayjs.extend(relativeTime);

interface DashboardSummary {
  kpis: {
    totalAssets: number;
    openTickets: number;
    closedTickets: number;
    lowStockCount: number;
    devicesTotal: number;
    devicesSeen24h: number;
    documentsTotal: number;
    docsReviewOverdue: number;
  };
  assetsByStatus: { status: string; count: number }[];
  ticketsByStatus: { status: string; count: number }[];
}

interface ActivityItem {
  id: number;
  action: string;
  entityType: string;
  createdAt: string;
  user: string;
}

interface LowStockItem {
  id: number;
  name: string;
  sku: string;
  quantityOnHand: number;
  unit: string;
  reorderLevel: number;
}

interface MaintenanceDueAsset {
  id: number;
  assetTag: string;
  name: string;
  nextServiceDate: string | null;
}

interface MonitoredDevice {
  id: number;
  hostname: string | null;
  ipAddress: string;
  status: string;
  lastSeenAt: string;
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// Mirrors web's home Dashboard widget catalog (client/src/pages/dashboard/widgets.tsx) using the
// same GET /dashboard/summary + /dashboard/activity endpoints, with the two chart widgets rendered
// as plain label/count rows instead of bar/pie charts — no charting library on mobile — and the two
// radial-gauge widgets rendered as simple "N / M" progress bars.
export function DashboardScreen() {
  const { colors, spacing, radius } = useTheme();
  const { user, organization, hasPermission } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();

  const { data: summary, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["mobile-dashboard-summary"],
    queryFn: async () => (await axiosClient.get("/dashboard/summary")).data as DashboardSummary,
    enabled: hasPermission("dashboard", "view"),
  });

  const { data: activity } = useQuery({
    queryKey: ["mobile-dashboard-activity"],
    queryFn: async () => (await axiosClient.get("/dashboard/activity", { params: { page: 1, pageSize: 6 } })).data.items as ActivityItem[],
    enabled: hasPermission("dashboard", "view"),
  });

  const { data: lowStock } = useQuery({
    queryKey: ["mobile-dashboard-low-stock"],
    queryFn: async () => (await axiosClient.get("/stock/low-stock")).data as LowStockItem[],
    enabled: hasPermission("stock", "view"),
  });

  const { data: maintenanceDue } = useQuery({
    queryKey: ["mobile-dashboard-maintenance-due"],
    queryFn: async () => (await axiosClient.get("/operations/maintenance-due")).data as MaintenanceDueAsset[],
    enabled: hasPermission("operations", "view"),
  });

  const { data: monitoredDevices } = useQuery({
    queryKey: ["mobile-dashboard-monitored-devices"],
    queryFn: async () => (await axiosClient.get("/network/monitor/devices")).data as MonitoredDevice[],
    enabled: hasPermission("network", "view"),
  });
  const offlineDevices = (monitoredDevices ?? []).filter((d) => d.status === "OFFLINE");

  const kpis = summary?.kpis;
  const tiles = [
    { key: "assets", label: "Assets", value: kpis?.totalAssets, tone: colors.primary },
    { key: "tickets", label: "Open Tickets", value: kpis?.openTickets, tone: colors.warning },
    { key: "stock", label: "Low Stock", value: kpis?.lowStockCount, tone: colors.danger },
    { key: "docs", label: "Docs & SOPs", value: kpis?.documentsTotal, tone: kpis && kpis.docsReviewOverdue > 0 ? colors.danger : colors.success, sub: kpis && kpis.docsReviewOverdue > 0 ? `${kpis.docsReviewOverdue} overdue for review` : undefined },
  ];

  const devicesOnlinePct = kpis && kpis.devicesTotal > 0 ? Math.round((kpis.devicesSeen24h / kpis.devicesTotal) * 100) : null;
  const ticketResolutionPct = kpis && kpis.openTickets + kpis.closedTickets > 0 ? Math.round((kpis.closedTickets / (kpis.openTickets + kpis.closedTickets)) * 100) : null;

  function goToStock(id: number) {
    (navigation.getParent() as any)?.navigate("StockTab", { screen: "StockDetail", params: { id } });
  }
  function goToAsset(id: number) {
    (navigation.getParent() as any)?.navigate("AssetsTab", { screen: "AssetDetail", params: { id } });
  }

  const tileTargets: Record<string, () => void> = {
    assets: () => (navigation.getParent() as any)?.navigate("AssetsTab", { screen: "AssetsList" }),
    tickets: () => (navigation.getParent() as any)?.navigate("HelpdeskTab", { screen: "TicketList" }),
    stock: () => (navigation.getParent() as any)?.navigate("StockTab", { screen: "StockList" }),
    docs: () => (navigation.getParent() as any)?.navigate("MoreTab", { screen: "DocsList" }),
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
    >
      <Text style={[styles.greeting, { color: colors.text }]}>Hi, {user?.firstName ?? "there"}</Text>
      <Text style={[styles.orgName, { color: colors.textMuted, marginBottom: spacing.lg }]}>{organization?.name ?? ""}</Text>

      <View style={styles.grid}>
        {tiles.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tile, { backgroundColor: t.tone + "1a", borderRadius: radius.lg, padding: spacing.lg }]}
            onPress={tileTargets[t.key]}
            activeOpacity={0.75}
          >
            <Text style={[styles.tileValue, { color: t.tone }]}>{isLoading ? "…" : t.value ?? "—"}</Text>
            <Text style={[styles.tileLabel, { color: colors.text }]}>{t.label}</Text>
            {t.sub && <Text style={{ color: t.tone, fontSize: 10.5, fontWeight: "700", marginTop: 2 }}>{t.sub}</Text>}
          </TouchableOpacity>
        ))}
      </View>

      {kpis && kpis.devicesTotal > 0 && (
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          <ProgressRow label="Devices Seen (24h)" value={`${kpis.devicesSeen24h} / ${kpis.devicesTotal}`} pct={devicesOnlinePct ?? 0} tone={colors.primary} />
          {ticketResolutionPct != null && <ProgressRow label="Ticket Resolution Rate" value={`${ticketResolutionPct}%`} pct={ticketResolutionPct} tone={colors.success} />}
        </View>
      )}

      {summary && summary.assetsByStatus.length > 0 && (
        <SectionCard title="Assets by Status">
          {summary.assetsByStatus.map((g) => (
            <StatusRow key={g.status} label={statusLabel(g.status)} count={g.count} />
          ))}
        </SectionCard>
      )}

      {summary && summary.ticketsByStatus.length > 0 && (
        <SectionCard title="Tickets by Status">
          {summary.ticketsByStatus.map((g) => (
            <StatusRow key={g.status} label={statusLabel(g.status)} count={g.count} />
          ))}
        </SectionCard>
      )}

      {lowStock && lowStock.length > 0 && (
        <SectionCard title="Low Stock Items">
          {lowStock.slice(0, 5).map((item) => (
            <TouchableOpacity key={item.id} onPress={() => goToStock(item.id)} style={styles.listRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.listRowTitle, { color: colors.text }]}>{item.name}</Text>
                <Text style={[styles.listRowSub, { color: colors.textMuted }]}>{item.sku}</Text>
              </View>
              <Text style={{ color: colors.danger, fontSize: 12.5, fontWeight: "700" }}>{item.quantityOnHand} {item.unit}</Text>
            </TouchableOpacity>
          ))}
        </SectionCard>
      )}

      {maintenanceDue && maintenanceDue.length > 0 && (
        <SectionCard title="Maintenance Due">
          {maintenanceDue.slice(0, 5).map((a) => (
            <TouchableOpacity key={a.id} onPress={() => goToAsset(a.id)} style={styles.listRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.listRowTitle, { color: colors.text }]}>{a.name}</Text>
                <Text style={[styles.listRowSub, { color: colors.textMuted }]}>{a.assetTag}</Text>
              </View>
              <Text style={{ color: colors.warning, fontSize: 12, fontWeight: "700" }}>{a.nextServiceDate ? dayjs(a.nextServiceDate).format("DD MMM YYYY") : "—"}</Text>
            </TouchableOpacity>
          ))}
        </SectionCard>
      )}

      {offlineDevices.length > 0 && (
        <SectionCard title="Offline Devices">
          {offlineDevices.slice(0, 5).map((d) => (
            <View key={d.id} style={styles.listRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.listRowTitle, { color: colors.text }]}>{d.hostname ?? d.ipAddress}</Text>
                <Text style={[styles.listRowSub, { color: colors.textMuted }]}>{d.ipAddress}</Text>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 11.5 }}>Last seen {dayjs(d.lastSeenAt).fromNow()}</Text>
            </View>
          ))}
        </SectionCard>
      )}

      {activity && activity.length > 0 && (
        <SectionCard title="Recent Activity">
          {activity.map((a) => (
            <View key={a.id} style={styles.listRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.listRowTitle, { color: colors.text }]}>{a.action}</Text>
                <Text style={[styles.listRowSub, { color: colors.textMuted }]}>{a.user} · {a.entityType}</Text>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>{dayjs(a.createdAt).fromNow()}</Text>
            </View>
          ))}
        </SectionCard>
      )}
    </ScrollView>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ marginTop: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
      <Text style={{ color: colors.text, fontSize: 13, fontWeight: "800", marginBottom: 6, textTransform: "uppercase" }}>{title}</Text>
      {children}
    </View>
  );
}

function StatusRow({ label, count }: { label: string; count: number }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.listRow, { borderBottomColor: colors.border }]}>
      <Text style={{ color: colors.text, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "700" }}>{count}</Text>
    </View>
  );
}

function ProgressRow({ label, value, pct, tone }: { label: string; value: string; pct: number; tone: string }) {
  const { colors, radius } = useTheme();
  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
        <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "700" }}>{label}</Text>
        <Text style={{ color: tone, fontSize: 12.5, fontWeight: "700" }}>{value}</Text>
      </View>
      <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: colors.border, overflow: "hidden" }}>
        <View style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: "100%", backgroundColor: tone }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  greeting: { fontSize: 24, fontWeight: "800" },
  orgName: { fontSize: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: { flexBasis: "47%", flexGrow: 1 },
  tileValue: { fontSize: 28, fontWeight: "800" },
  tileLabel: { fontSize: 13, fontWeight: "600", marginTop: 4 },
  listRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "transparent" },
  listRowTitle: { fontSize: 13, fontWeight: "700" },
  listRowSub: { fontSize: 11.5, marginTop: 1 },
});

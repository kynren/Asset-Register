import { useQuery } from "@tanstack/react-query";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { axiosClient } from "../../api/axiosClient";
import { useAuth } from "../../auth/AuthContext";
import { useTheme } from "../../theme/ThemeContext";

// Home tab — pulls the same per-module stats endpoints the web Dashboard's KPI widgets use
// (see server/src/modules/dashboard) rather than trying to replicate the web's fully custom,
// drag-and-drop widget canvas on a phone screen.
export function DashboardScreen() {
  const { colors, spacing, radius } = useTheme();
  const { user, organization } = useAuth();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["mobile-dashboard-summary"],
    queryFn: async () => {
      const [assets, tickets, stock] = await Promise.allSettled([
        axiosClient.get("/assets/stats"),
        axiosClient.get("/helpdesk/stats"),
        axiosClient.get("/stock/stats"),
      ]);
      return {
        assets: assets.status === "fulfilled" ? assets.value.data : null,
        tickets: tickets.status === "fulfilled" ? tickets.value.data : null,
        stock: stock.status === "fulfilled" ? stock.value.data : null,
      };
    },
  });

  const openTickets = data?.tickets?.byStatus
    ?.filter((g: { status: string }) => g.status !== "RESOLVED" && g.status !== "CLOSED")
    .reduce((sum: number, g: { count: number }) => sum + g.count, 0);

  const tiles = [
    { key: "assets", label: "Assets", value: data?.assets?.total, tone: colors.primary },
    { key: "tickets", label: "Open Tickets", value: openTickets, tone: colors.warning },
    { key: "stock", label: "Stock Items", value: data?.stock?.totalItems, tone: colors.success },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
    >
      <Text style={[styles.greeting, { color: colors.text }]}>Hi, {user?.firstName ?? "there"}</Text>
      <Text style={[styles.orgName, { color: colors.textMuted, marginBottom: spacing.lg }]}>{organization?.name ?? ""}</Text>

      <View style={styles.grid}>
        {tiles.map((t) => (
          <View
            key={t.key}
            style={[styles.tile, { backgroundColor: t.tone + "1a", borderRadius: radius.lg, padding: spacing.lg }]}
          >
            <Text style={[styles.tileValue, { color: t.tone }]}>{isLoading ? "…" : t.value ?? "—"}</Text>
            <Text style={[styles.tileLabel, { color: colors.text }]}>{t.label}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  greeting: { fontSize: 24, fontWeight: "800" },
  orgName: { fontSize: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: { flexBasis: "47%", flexGrow: 1 },
  tileValue: { fontSize: 28, fontWeight: "800" },
  tileLabel: { fontSize: 13, fontWeight: "600", marginTop: 4 },
});

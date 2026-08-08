import { useQuery } from "@tanstack/react-query";
import { ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { ShimmerList } from "../../components/Shimmer";

interface StockStats { totalItems: number; totalOnHand: number; totalValue: number; lowStockCount: number; byCategory: { category: string; count: number }[] }

function Kpi({ label, value, icon, color }: { label: string; value: string | number; icon: keyof typeof Ionicons.glyphMap; color: string }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 6 }}>
      <View style={{ width: 30, height: 30, borderRadius: radius.pill, backgroundColor: color + "22", alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon} size={15} color={color} />
      </View>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>{value}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 11 }}>{label}</Text>
    </View>
  );
}

// Mirrors client/src/pages/stock/stockDashboardWidgets.tsx's default layout as a fixed set of
// tiles — mobile has no per-module multi-dashboard/widget-customization infrastructure (only the
// Home dashboard got that treatment), consistent with every other module dashboard on mobile.
export function StockDashboardScreen() {
  const { colors, spacing, radius } = useTheme();
  const { data, isLoading } = useQuery({ queryKey: ["mobile-stock-dashboard-stats"], queryFn: async () => (await axiosClient.get("/stock/stats")).data as StockStats, refetchInterval: 60_000 });

  if (isLoading || !data) return <ShimmerList />;

  const maxCategory = Math.max(...data.byCategory.map((c) => c.count), 1);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Kpi label="Total Stock Items" value={data.totalItems} icon="cube-outline" color={colors.primary} />
        <Kpi label="Low Stock Items" value={data.lowStockCount} icon="alert-circle-outline" color={colors.danger} />
      </View>
      <Kpi label="Total Stock Value" value={data.totalValue.toLocaleString(undefined, { style: "currency", currency: "GBP", maximumFractionDigits: 0 })} icon="cash-outline" color={colors.success} />

      <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg }}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700", marginBottom: 12 }}>Stock Items by Category</Text>
        {data.byCategory.length === 0 && <Text style={{ color: colors.textMuted, fontSize: 12 }}>No categorized stock yet.</Text>}
        <View style={{ gap: 10 }}>
          {data.byCategory.map((c) => (
            <View key={c.category}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "600" }}>{c.category}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{c.count}</Text>
              </View>
              <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: colors.border, overflow: "hidden" }}>
                <View style={{ width: `${(c.count / maxCategory) * 100}%`, height: "100%", backgroundColor: colors.primary, borderRadius: radius.pill }} />
              </View>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

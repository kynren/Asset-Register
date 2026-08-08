import { useQuery } from "@tanstack/react-query";
import { ScrollView, Text, View } from "react-native";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { ShimmerList } from "../../components/Shimmer";

interface AnalyticsRow { name?: string; date?: string; quantity?: number; out?: number }
interface StockAnalytics { topConsumed: AnalyticsRow[]; trend: AnalyticsRow[] }

// Mirrors StockPage.tsx's Analytics tab. Mobile has no chart library, so bars are drawn as
// proportional-width Views — the same "chart" convention used elsewhere on mobile (report
// bar/pie results, brightness sliders) instead of a real charting dependency.
function BarList({ rows, labelKey, valueKey, color }: { rows: AnalyticsRow[]; labelKey: "name" | "date"; valueKey: "quantity" | "out"; color: string }) {
  const { colors, spacing, radius } = useTheme();
  const max = Math.max(...rows.map((r) => r[valueKey] ?? 0), 1);
  return (
    <View style={{ gap: 10 }}>
      {rows.map((r, i) => (
        <View key={i}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "600" }}>{r[labelKey]}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{r[valueKey]}</Text>
          </View>
          <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: colors.border, overflow: "hidden" }}>
            <View style={{ width: `${((r[valueKey] ?? 0) / max) * 100}%`, height: "100%", backgroundColor: color, borderRadius: radius.pill }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function StockAnalyticsScreen() {
  const { colors, spacing, radius } = useTheme();
  const { data, isLoading } = useQuery({ queryKey: ["mobile-stock-analytics"], queryFn: async () => (await axiosClient.get("/stock/analytics")).data as StockAnalytics });

  if (isLoading) return <ShimmerList />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg }}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700", marginBottom: 12 }}>Top Consumed Items</Text>
        {data?.topConsumed?.length ? <BarList rows={data.topConsumed} labelKey="name" valueKey="quantity" color={colors.primary} /> : <Text style={{ color: colors.textMuted, fontSize: 12 }}>No consumption data yet.</Text>}
      </View>
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg }}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700", marginBottom: 12 }}>Stock Movement Trend</Text>
        {data?.trend?.length ? <BarList rows={data.trend} labelKey="date" valueKey="out" color={colors.warning} /> : <Text style={{ color: colors.textMuted, fontSize: 12 }}>No transactions logged yet.</Text>}
      </View>
    </ScrollView>
  );
}

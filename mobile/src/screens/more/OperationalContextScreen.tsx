import { useQuery } from "@tanstack/react-query";
import { ScrollView, Text, View } from "react-native";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { ShimmerListItem } from "../../components/Shimmer";

interface ShowStatusAsset {
  id: number;
  assetTag: string;
  name: string;
  alive: boolean;
  responseTimeMs: number | null;
}

interface ShowStatusResponse {
  total: number;
  active: number;
  assets: ShowStatusAsset[];
}

// Mirrors client/src/pages/operational/OperationalContextPage.tsx — same /assets/show-status
// endpoint, refetched every 15s. Web renders the percentage as a circular SVG gauge; mobile uses a
// horizontal progress bar (same pattern as the sidebar battery indicator elsewhere in this app)
// rather than pulling in react-native-svg for a single screen.
export function OperationalContextScreen() {
  const { colors, spacing, radius } = useTheme();

  const { data, isLoading } = useQuery({
    queryKey: ["mobile-operational-context"],
    queryFn: async () => (await axiosClient.get<ShowStatusResponse>("/assets/show-status")).data,
    refetchInterval: 15000,
  });

  const total = data?.total ?? 0;
  const active = data?.active ?? 0;
  const pct = total > 0 ? Math.round((active / total) * 100) : 0;
  const barColor = total === 0 ? colors.textMuted : pct >= 100 ? colors.success : pct >= 50 ? colors.primary : colors.danger;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.md }}>
        Live reachability of assets flagged as show-critical. Updates every 15 seconds.
      </Text>

      <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md }}>
        <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: "700", marginBottom: 10, textTransform: "uppercase" }}>Active Show Assets</Text>
        {isLoading ? (
          <ShimmerListItem />
        ) : (
          <>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
              <Text style={{ color: colors.text, fontSize: 32, fontWeight: "700" }}>{pct}%</Text>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{active} / {total} active</Text>
            </View>
            <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.border, overflow: "hidden" }}>
              <View style={{ height: "100%", width: `${Math.min(100, pct)}%`, backgroundColor: barColor, borderRadius: 5 }} />
            </View>
            {total === 0 && (
              <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 10 }}>
                No asset categories are flagged as "Show Asset" yet. Flag one in Admin & Setup → Categories & Locations to populate this gauge.
              </Text>
            )}
          </>
        )}
      </View>

      {!isLoading && total > 0 && (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700", marginBottom: 10 }}>Show Assets</Text>
          {data!.assets.map((a) => (
            <View key={a.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "600" }}>{a.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 10.5, fontFamily: "monospace" }}>{a.assetTag}</Text>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginRight: 8 }}>
                {a.responseTimeMs != null ? `${a.responseTimeMs} ms` : "—"}
              </Text>
              <View style={{ backgroundColor: a.alive ? colors.success + "22" : colors.danger + "22", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ color: a.alive ? colors.success : colors.danger, fontSize: 10, fontWeight: "700" }}>{a.alive ? "Active" : "Unreachable"}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

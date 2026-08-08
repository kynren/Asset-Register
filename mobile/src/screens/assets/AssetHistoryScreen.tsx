import { useQuery } from "@tanstack/react-query";
import { useRoute, RouteProp } from "@react-navigation/native";
import { Linking, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { ShimmerDetail } from "../../components/Shimmer";
import { Asset, AssetHistoryEntry } from "../../types/asset";
import { AssetsStackParamList } from "../../navigation/types";

const ACTION_LABELS: Record<string, string> = {
  "asset.create": "Asset created", "asset.update": "Asset details updated", "asset.delete": "Asset deleted",
  "asset.checkout": "Checked out", "asset.checkin": "Checked in",
};

function summarizeMetadata(metadata: Record<string, unknown> | null): string {
  if (!metadata) return "Updated";
  const keys = Object.keys(metadata).filter((k) => !["resourceKey", "id"].includes(k));
  return keys.length === 0 ? "Updated" : `Changed: ${keys.join(", ")}`;
}

// Combines client/src/pages/assets/detail/LocationHistoryTab.tsx (current location + change
// history) and ActivityLogTab.tsx (full action log) — both read the same /assets/:id/history
// endpoint, so mobile shows them as one screen instead of two separate tabs for the same data.
export function AssetHistoryScreen() {
  const { colors, spacing, radius } = useTheme();
  const route = useRoute<RouteProp<AssetsStackParamList, "AssetHistory">>();
  const { assetId } = route.params;

  const { data: asset, isLoading: assetLoading } = useQuery({ queryKey: ["mobile-asset", assetId], queryFn: async () => (await axiosClient.get(`/assets/${assetId}`)).data as Asset });
  const { data: history, isLoading: historyLoading } = useQuery({ queryKey: ["mobile-asset-history", assetId], queryFn: async () => (await axiosClient.get(`/assets/${assetId}/history`)).data as AssetHistoryEntry[] });

  if (assetLoading || !asset) return <ShimmerDetail />;

  const mapQuery = encodeURIComponent(asset.location?.name ?? "");
  const cardStyle = { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      <View style={cardStyle}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700", marginBottom: 8 }}>Current Location</Text>
        {asset.location ? (
          <>
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{asset.location.name}</Text>
            <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.primary, borderRadius: radius.md, alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 9, marginTop: 10 }} onPress={() => Linking.openURL(`https://www.openstreetmap.org/search?query=${mapQuery}`)}>
              <Ionicons name="map-outline" size={14} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Open in Maps</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>No location assigned to this asset yet.</Text>
        )}
      </View>

      <View style={cardStyle}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700", marginBottom: 8 }}>Activity Log</Text>
        {historyLoading ? (
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Loading...</Text>
        ) : !history?.length ? (
          <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>No activity recorded for this asset yet.</Text>
        ) : (
          history.map((h, i) => (
            <View key={h.id} style={{ paddingVertical: 8, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{ACTION_LABELS[h.action] ?? summarizeMetadata(h.metadata)}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                {h.user ? `${h.user.firstName} ${h.user.lastName}` : "System"} · {dayjs(h.createdAt).format("DD MMM YYYY, HH:mm:ss")}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

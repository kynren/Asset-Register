import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, RouteProp } from "@react-navigation/native";
import { FlatList, Text, TextInput, View } from "react-native";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { ShimmerDetail } from "../../components/Shimmer";
import { Asset } from "../../types/asset";
import { AssetsStackParamList } from "../../navigation/types";

// Mirrors client/src/pages/assets/detail/SoftwareTab.tsx — applications installed on this asset,
// as reported by the Kynren agent.
export function AssetSoftwareScreen() {
  const { colors, spacing, radius } = useTheme();
  const route = useRoute<RouteProp<AssetsStackParamList, "AssetSoftware">>();
  const { assetId } = route.params;
  const [search, setSearch] = useState("");

  const { data: asset, isLoading } = useQuery({ queryKey: ["mobile-asset", assetId], queryFn: async () => (await axiosClient.get(`/assets/${assetId}`)).data as Asset });

  if (isLoading || !asset) return <ShimmerDetail />;

  const software = asset.device?.installedSoftware ?? [];
  const filtered = software.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));
  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface };

  if (!asset.device) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg }}>
        <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: 40 }}>No device linked to this asset, so no installed software has been reported.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
        <TextInput style={inputStyle} placeholder="Search installed software..." placeholderTextColor={colors.textMuted} value={search} onChangeText={setSearch} />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(s, i) => `${s.name}-${i}`}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: 6 }}
        ListEmptyComponent={<Text style={{ color: colors.textMuted, fontSize: 12.5, textAlign: "center" }}>{software.length === 0 ? "The agent has not reported any installed software for this device yet." : `No software matches "${search}".`}</Text>}
        renderItem={({ item }) => (
          <View style={{ flexDirection: "row", justifyContent: "space-between", backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10 }}>
            <Text style={{ color: colors.text, fontSize: 13, flex: 1 }} numberOfLines={1}>{item.name}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{item.version ?? "—"}</Text>
          </View>
        )}
      />
    </View>
  );
}

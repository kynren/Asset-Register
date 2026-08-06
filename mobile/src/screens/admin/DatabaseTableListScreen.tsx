import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { FlatList, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { ShimmerList } from "../../components/Shimmer";
import { SchemaRegistry } from "../../lib/databaseTypes";
import { MoreStackParamList } from "../../navigation/types";

// Mirrors client/src/pages/appSettings/DatabaseManagerTab.tsx's Tables sub-tab. The Relationships
// sub-tab (a ReactFlow node/edge graph) is ported as a simple grouped list instead — see
// DatabaseRelationshipsScreen.tsx — since a pannable graph isn't worth the effort for a
// mostly-textual schema browser.
export function DatabaseTableListScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const [search, setSearch] = useState("");

  const { data: registry, isLoading } = useQuery({ queryKey: ["mobile-db-schema"], queryFn: async () => (await axiosClient.get("/database/schema")).data as SchemaRegistry });
  const { data: stats } = useQuery({ queryKey: ["mobile-db-stats"], queryFn: async () => (await axiosClient.get("/database/stats")).data as { model: string; count: number | null }[] });
  const statsByModel = useMemo(() => new Map((stats ?? []).map((s) => [s.model, s.count])), [stats]);

  const filtered = useMemo(() => {
    const list = registry?.models ?? [];
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter((m) => m.name.toLowerCase().includes(q));
  }, [registry, search]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm, flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 12, height: 42 }}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput style={{ flex: 1, marginLeft: 8, color: colors.text }} placeholder="Search tables..." placeholderTextColor={colors.textMuted} value={search} onChangeText={setSearch} />
        </View>
        <TouchableOpacity style={{ width: 42, height: 42, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }} onPress={() => navigation.navigate("DatabaseRelationships")}>
          <Ionicons name="git-network-outline" size={18} color={colors.text} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ShimmerList />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.name}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.sm }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}
              onPress={() => navigation.navigate("DatabaseRowList", { model: item.name })}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{item.name}</Text>
                  {item.sensitive && <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />}
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{item.fields.length} fields</Text>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginRight: 8 }}>{statsByModel.get(item.name) ?? "—"}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

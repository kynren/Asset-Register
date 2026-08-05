import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { FlatList, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { SchemaRegistry } from "../../lib/databaseTypes";
import { MoreStackParamList } from "../../navigation/types";

// Mirrors client/src/pages/appSettings/DatabaseRelationshipsView.tsx's node/edge graph (ReactFlow,
// web-only) as a grouped text list instead — same simplification as Network Topology's list view:
// every model with its outgoing foreign-key relations, tap a related model to jump to its table.
export function DatabaseRelationshipsScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const [filter, setFilter] = useState("");

  const { data: registry } = useQuery({ queryKey: ["mobile-db-schema"], queryFn: async () => (await axiosClient.get("/database/schema")).data as SchemaRegistry });

  const grouped = useMemo(() => {
    if (!registry) return [];
    const byModel = new Map<string, typeof registry.edges>();
    for (const m of registry.models) byModel.set(m.name, []);
    for (const e of registry.edges) byModel.get(e.fromModel)?.push(e);
    let entries = [...byModel.entries()];
    if (filter.trim()) {
      const q = filter.trim().toLowerCase();
      entries = entries.filter(([name]) => name.toLowerCase().includes(q));
    }
    return entries;
  }, [registry, filter]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 12, height: 42 }}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput style={{ flex: 1, marginLeft: 8, color: colors.text }} placeholder="Filter tables..." placeholderTextColor={colors.textMuted} value={filter} onChangeText={setFilter} />
        </View>
        {registry && <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 8 }}>{registry.models.length} tables · {registry.edges.length} relations</Text>}
      </View>
      <FlatList
        data={grouped}
        keyExtractor={([name]) => name}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.sm }}
        renderItem={({ item: [modelName, edges] }) => (
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
            <TouchableOpacity onPress={() => navigation.navigate("DatabaseRowList", { model: modelName })}>
              <Text style={{ color: colors.primary, fontSize: 13.5, fontWeight: "700" }}>{modelName}</Text>
            </TouchableOpacity>
            {edges.length === 0 ? (
              <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 4 }}>No outgoing relations.</Text>
            ) : (
              edges.map((e) => (
                <TouchableOpacity key={e.id} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }} onPress={() => navigation.navigate("DatabaseRowList", { model: e.toModel })}>
                  <Ionicons name={e.cardinality === "one-to-one" ? "swap-horizontal-outline" : "git-branch-outline"} size={13} color={colors.textMuted} />
                  <Text style={{ color: colors.textMuted, fontSize: 11.5 }}>
                    {e.fkField} <Text style={{ color: colors.text, fontWeight: "600" }}>→ {e.toModel}</Text> ({e.cardinality})
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}
      />
    </View>
  );
}

import { useLayoutEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, Alert, FlatList, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { DbFieldInfo, DbListResult, SENSITIVE_FIELD_PATTERN, SchemaRegistry } from "../../lib/databaseTypes";
import { MoreStackParamList } from "../../navigation/types";
import { ShimmerList } from "../../components/Shimmer";

function formatCellValue(field: DbFieldInfo, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (SENSITIVE_FIELD_PATTERN.test(field.name)) return "••••••••";
  if (field.type === "Boolean") return value ? "Yes" : "No";
  if (field.type === "DateTime") {
    const d = dayjs(value as string);
    return d.isValid() ? d.format("DD MMM YYYY HH:mm") : String(value);
  }
  if (field.type === "Json") return typeof value === "string" ? value : JSON.stringify(value);
  return String(value);
}

export function DatabaseRowListScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const route = useRoute<RouteProp<MoreStackParamList, "DatabaseRowList">>();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const { model: modelName } = route.params;
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  useLayoutEffect(() => {
    navigation.setOptions({ title: modelName });
  }, [navigation, modelName]);

  const { data: registry } = useQuery({ queryKey: ["mobile-db-schema"], queryFn: async () => (await axiosClient.get("/database/schema")).data as SchemaRegistry });
  const model = registry?.models.find((m) => m.name === modelName);

  const { data: rowsResult, isLoading } = useQuery({
    queryKey: ["mobile-db-rows", modelName, page, search],
    queryFn: async () => (await axiosClient.get(`/database/tables/${modelName}`, { params: { page, pageSize: 25, search: search || undefined } })).data as DbListResult,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: unknown) => axiosClient.delete(`/database/tables/${modelName}/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-db-rows", modelName] });
      queryClient.invalidateQueries({ queryKey: ["mobile-db-stats"] });
    },
  });

  function confirmDelete(row: Record<string, unknown>) {
    if (!model) return;
    Alert.alert(`Delete ${model.name}`, `Delete this ${model.name} record (#${String(row[model.idField])})? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(row[model.idField]) },
    ]);
  }

  if (!model) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const previewFields = model.fields.filter((f) => f.kind !== "object").slice(0, 4);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {model.sensitive && (
        <View style={{ backgroundColor: colors.danger + "22", padding: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.sm, borderRadius: radius.md }}>
          <Text style={{ color: colors.danger, fontSize: 11.5 }}>Sensitive table — contains security-relevant data. Edit/delete with care.</Text>
        </View>
      )}
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 12, height: 42 }}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput style={{ flex: 1, marginLeft: 8, color: colors.text }} placeholder={`Search ${model.name}...`} placeholderTextColor={colors.textMuted} value={search} onChangeText={(v) => { setSearch(v); setPage(1); }} />
        </View>
      </View>

      {isLoading ? (
        <ShimmerList />
      ) : (
        <FlatList
          data={rowsResult?.rows ?? []}
          keyExtractor={(item) => String(item[model.idField])}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.sm, paddingBottom: 80 }}
          ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 24 }}>No {model.name} records.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}
              onPress={() => hasPermission("app-settings", "edit") && navigation.navigate("DatabaseRowForm", { model: modelName, id: String(item[model.idField]) })}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>#{String(item[model.idField])} {item[model.displayField] ? `— ${String(item[model.displayField])}` : ""}</Text>
                {hasPermission("app-settings", "delete") && (
                  <TouchableOpacity onPress={() => confirmDelete(item)}>
                    <Ionicons name="trash-outline" size={16} color={colors.danger} />
                  </TouchableOpacity>
                )}
              </View>
              {previewFields.map((f) => (
                <Text key={f.name} style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                  {f.name}: <Text style={{ color: colors.text }}>{formatCellValue(f, item[f.name])}</Text>
                </Text>
              ))}
            </TouchableOpacity>
          )}
          ListFooterComponent={
            rowsResult && rowsResult.totalPages > 1 ? (
              <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 14, marginTop: 10 }}>
                <TouchableOpacity disabled={page <= 1} onPress={() => setPage((p) => p - 1)}><Text style={{ color: page <= 1 ? colors.textMuted : colors.primary, fontWeight: "700" }}>‹ Prev</Text></TouchableOpacity>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>Page {rowsResult.page} of {rowsResult.totalPages}</Text>
                <TouchableOpacity disabled={page >= rowsResult.totalPages} onPress={() => setPage((p) => p + 1)}><Text style={{ color: page >= rowsResult.totalPages ? colors.textMuted : colors.primary, fontWeight: "700" }}>Next ›</Text></TouchableOpacity>
              </View>
            ) : null
          }
        />
      )}

      {hasPermission("app-settings", "create") && (
        <TouchableOpacity
          style={{ position: "absolute", right: spacing.lg, bottom: spacing.lg, backgroundColor: colors.primary, borderRadius: 28, width: 56, height: 56, alignItems: "center", justifyContent: "center", elevation: 4 }}
          onPress={() => navigation.navigate("DatabaseRowForm", { model: modelName })}
        >
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

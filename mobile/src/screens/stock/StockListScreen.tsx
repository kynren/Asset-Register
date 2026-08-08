import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useAuth } from "../../auth/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { ShimmerList } from "../../components/Shimmer";
import { CustomColumnsSheet } from "../../components/CustomColumnsSheet";
import { StockItem } from "../../types/stock";
import { PaginatedResponse } from "../../types/asset";
import { StockStackParamList } from "../../navigation/types";

const PAGE_SIZE = 25;

export function StockListScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<StockStackParamList>>();

  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [showCustomColumns, setShowCustomColumns] = useState(false);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch, isRefetching } = useInfiniteQuery({
    queryKey: ["mobile-stock", search, lowStockOnly],
    queryFn: async ({ pageParam }) => {
      const res = await axiosClient.get("/stock", {
        params: { page: pageParam, pageSize: PAGE_SIZE, search: search || undefined, lowStock: lowStockOnly || undefined },
      });
      return res.data as PaginatedResponse<StockItem>;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined),
  });

  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const canCreate = hasPermission("stock", "create");

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm }}>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md }]}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={{ flex: 1, marginLeft: 8, color: colors.text }}
              placeholder="Search stock items..."
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
            />
          </View>
          <TouchableOpacity style={[styles.iconButton, { backgroundColor: colors.primary, borderRadius: radius.md }]} onPress={() => navigation.navigate("StockScan")}>
            <Ionicons name="scan" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => setLowStockOnly((v) => !v)}
          style={{
            alignSelf: "flex-start",
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 14,
            paddingVertical: 7,
            borderRadius: radius.pill,
            backgroundColor: lowStockOnly ? colors.warning : colors.surface,
            borderWidth: 1,
            borderColor: lowStockOnly ? colors.warning : colors.border,
          }}
        >
          <Ionicons name="alert-circle-outline" size={14} color={lowStockOnly ? "#fff" : colors.textMuted} />
          <Text style={{ color: lowStockOnly ? "#fff" : colors.text, fontSize: 12.5, fontWeight: "600" }}>Low stock only</Text>
        </TouchableOpacity>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {[
            { key: "StockDashboard" as const, label: "Dashboard", icon: "grid-outline" as const },
            { key: "StockAnalytics" as const, label: "Analytics", icon: "bar-chart-outline" as const },
            { key: "StockProcurement" as const, label: "Suppliers & POs", icon: "cart-outline" as const },
          ].map((b) => (
            <TouchableOpacity
              key={b.key}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 }}
              onPress={() => navigation.navigate(b.key)}
            >
              <Ionicons name={b.icon} size={14} color={colors.text} />
              <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600" }}>{b.label}</Text>
            </TouchableOpacity>
          ))}
          {hasPermission("stock", "edit") && (
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 }}
              onPress={() => setShowCustomColumns(true)}
            >
              <Ionicons name="options-outline" size={14} color={colors.text} />
              <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600" }}>Custom Columns</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {isLoading ? (
        <ShimmerList />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => hasNextPage && fetchNextPage()}
          ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: 16 }} color={colors.primary} /> : null}
          ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 40 }}>No stock items found.</Text>}
          renderItem={({ item }) => {
            const low = item.quantityOnHand <= item.reorderLevel;
            return (
              <TouchableOpacity
                style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}
                onPress={() => navigation.navigate("StockDetail", { id: item.id })}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{item.name}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                      {item.sku}
                      {item.stockItemType ? ` · ${item.stockItemType.name}` : item.category ? ` · ${item.category}` : ""}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ color: low ? colors.danger : colors.text, fontSize: 15, fontWeight: "800" }}>
                      {item.quantityOnHand} {item.unit}
                    </Text>
                    {low && <Text style={{ color: colors.danger, fontSize: 10, fontWeight: "700", marginTop: 2 }}>LOW STOCK</Text>}
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {canCreate && (
        <TouchableOpacity style={[styles.fab, { backgroundColor: colors.primary, borderRadius: radius.pill }]} onPress={() => navigation.navigate("StockForm", undefined)}>
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      )}

      <CustomColumnsSheet visible={showCustomColumns} entityType="StockItem" title="Stock Custom Columns" onClose={() => setShowCustomColumns(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  searchBox: { flex: 1, flexDirection: "row", alignItems: "center", borderWidth: 1, paddingHorizontal: 12, height: 42 },
  iconButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  fab: { position: "absolute", right: 20, bottom: 20, width: 56, height: 56, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
});

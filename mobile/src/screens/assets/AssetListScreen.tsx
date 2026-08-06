import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useAuth } from "../../auth/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { StatusBadge } from "../../components/StatusBadge";
import { ShimmerList } from "../../components/Shimmer";
import { Asset, AssetCategory, PaginatedResponse } from "../../types/asset";
import { AssetsStackParamList } from "../../navigation/types";

const PAGE_SIZE = 25;

export function AssetListScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<AssetsStackParamList>>();

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);

  const { data: categories } = useQuery({
    queryKey: ["mobile-asset-categories"],
    queryFn: async () => (await axiosClient.get("/asset-categories")).data as AssetCategory[],
  });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch, isRefetching } = useInfiniteQuery({
    queryKey: ["mobile-assets", search, categoryId],
    queryFn: async ({ pageParam }) => {
      const res = await axiosClient.get("/assets", {
        params: { page: pageParam, pageSize: PAGE_SIZE, search: search || undefined, categoryId: categoryId ?? undefined },
      });
      return res.data as PaginatedResponse<Asset>;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined),
  });

  const assets = data?.pages.flatMap((p) => p.items) ?? [];
  const canCreate = hasPermission("assets", "create");

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm }}>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md }]}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={{ flex: 1, marginLeft: 8, color: colors.text }}
              placeholder="Search assets..."
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
            />
          </View>
          <TouchableOpacity
            style={[styles.iconButton, { backgroundColor: colors.primary, borderRadius: radius.md }]}
            onPress={() => navigation.navigate("AssetScan")}
          >
            <Ionicons name="scan" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {!!categories?.length && (
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={[{ id: -1, name: "All" }, ...categories]}
            keyExtractor={(c) => String(c.id)}
            contentContainerStyle={{ gap: 8 }}
            renderItem={({ item }) => {
              const active = item.id === -1 ? categoryId === null : categoryId === item.id;
              return (
                <TouchableOpacity
                  onPress={() => setCategoryId(item.id === -1 ? null : item.id)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 7,
                    borderRadius: radius.pill,
                    backgroundColor: active ? colors.primary : colors.surface,
                    borderWidth: 1,
                    borderColor: active ? colors.primary : colors.border,
                  }}
                >
                  <Text style={{ color: active ? "#fff" : colors.text, fontSize: 12.5, fontWeight: "600" }}>{item.name}</Text>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>

      {isLoading ? (
        <ShimmerList />
      ) : (
        <FlatList
          data={assets}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => hasNextPage && fetchNextPage()}
          ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: 16 }} color={colors.primary} /> : null}
          ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 40 }}>No assets found.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}
              onPress={() => navigation.navigate("AssetDetail", { id: item.id })}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{item.name}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                    {item.assetTag}
                    {item.category ? ` · ${item.category.name}` : ""}
                  </Text>
                </View>
                <StatusBadge status={item.status} />
              </View>
              {(item.location || item.assignedTo) && (
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 6 }}>
                  {item.location?.name}
                  {item.location && item.assignedTo ? " · " : ""}
                  {item.assignedTo ? `${item.assignedTo.firstName} ${item.assignedTo.lastName}` : ""}
                </Text>
              )}
            </TouchableOpacity>
          )}
        />
      )}

      {canCreate && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: colors.primary, borderRadius: radius.pill }]}
          onPress={() => navigation.navigate("AssetForm", undefined)}
        >
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchBox: { flex: 1, flexDirection: "row", alignItems: "center", borderWidth: 1, paddingHorizontal: 12, height: 42 },
  iconButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  fab: { position: "absolute", right: 20, bottom: 20, width: 56, height: 56, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
});

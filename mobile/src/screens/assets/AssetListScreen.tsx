import { useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useAuth } from "../../auth/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { StatusBadge } from "../../components/StatusBadge";
import { ShimmerList } from "../../components/Shimmer";
import { CustomColumnsSheet } from "../../components/CustomColumnsSheet";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { downloadAndShare } from "../../lib/downloadFile";
import { Asset, ASSET_STATUS_OPTIONS, AssetCategory, PaginatedResponse } from "../../types/asset";
import { AssetsStackParamList } from "../../navigation/types";

const PAGE_SIZE = 25;

export function AssetListScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<AssetsStackParamList>>();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<Asset["status"]>("IN_STORAGE");
  const [bulkStatusPickerOpen, setBulkStatusPickerOpen] = useState(false);
  const [showCustomColumns, setShowCustomColumns] = useState(false);
  const [exporting, setExporting] = useState<"csv" | "json" | null>(null);

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

  const bulkMutation = useMutation({
    mutationFn: () => Promise.all([...selectedIds].map((id) => axiosClient.patch(`/assets/${id}`, { status: bulkStatus }))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-assets"] });
      queryClient.invalidateQueries({ queryKey: ["mobile-asset-stats"] });
      setSelectedIds(new Set());
      setSelectMode(false);
    },
  });

  async function exportFile(kind: "csv" | "json") {
    setExporting(kind);
    try {
      if (kind === "csv") await downloadAndShare("/assets/export", "assets.csv");
      else await downloadAndShare("/assets/export.json", "assets.json");
    } finally {
      setExporting(null);
    }
  }

  function toggleSelected(id: number) {
    setSelectedIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const assets = data?.pages.flatMap((p) => p.items) ?? [];
  const canCreate = hasPermission("assets", "create");
  const canEdit = hasPermission("assets", "edit");
  const statusOptions: PickerOption[] = ASSET_STATUS_OPTIONS.map((s) => ({ id: s.value, label: s.label }));

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

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {canEdit && (
            <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: selectMode ? colors.primary : colors.border, backgroundColor: selectMode ? colors.primary + "1a" : "transparent", borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 }} onPress={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); }}>
              <Ionicons name="checkbox-outline" size={14} color={selectMode ? colors.primary : colors.text} />
              <Text style={{ color: selectMode ? colors.primary : colors.text, fontSize: 12, fontWeight: "600" }}>{selectMode ? "Cancel Select" : "Select"}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 }} onPress={() => exportFile("csv")} disabled={exporting !== null}>
            {exporting === "csv" ? <ActivityIndicator size="small" color={colors.text} /> : <Ionicons name="download-outline" size={14} color={colors.text} />}
            <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600" }}>Export CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 }} onPress={() => exportFile("json")} disabled={exporting !== null}>
            {exporting === "json" ? <ActivityIndicator size="small" color={colors.text} /> : <Ionicons name="document-outline" size={14} color={colors.text} />}
            <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600" }}>Export JSON</Text>
          </TouchableOpacity>
          {canCreate && (
            <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 }} onPress={() => navigation.navigate("DiscoverAssets")}>
              <Ionicons name="hardware-chip-outline" size={14} color={colors.text} />
              <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600" }}>Discover</Text>
            </TouchableOpacity>
          )}
          {canEdit && (
            <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 }} onPress={() => navigation.navigate("AssetIntakeQueue")}>
              <Ionicons name="link-outline" size={14} color={colors.text} />
              <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600" }}>Intake Queue</Text>
            </TouchableOpacity>
          )}
          {hasPermission("assets", "import") && (
            <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 }} onPress={() => navigation.navigate("AssetImport")}>
              <Ionicons name="cloud-upload-outline" size={14} color={colors.text} />
              <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600" }}>Import CSV</Text>
            </TouchableOpacity>
          )}
          {hasPermission("admin", "edit") && (
            <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 }} onPress={() => navigation.navigate("AssetCollections")}>
              <Ionicons name="albums-outline" size={14} color={colors.text} />
              <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600" }}>Collections</Text>
            </TouchableOpacity>
          )}
          {canEdit && (
            <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 }} onPress={() => setShowCustomColumns(true)}>
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
          data={assets}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.sm, paddingBottom: selectedIds.size > 0 ? 90 : spacing.lg }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => hasNextPage && fetchNextPage()}
          ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: 16 }} color={colors.primary} /> : null}
          ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 40 }}>No assets found.</Text>}
          renderItem={({ item }) => {
            const selected = selectedIds.has(item.id);
            return (
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: selected ? 2 : 1, borderColor: selected ? colors.primary : colors.border, padding: spacing.md }}
                onPress={() => (selectMode ? toggleSelected(item.id) : navigation.navigate("AssetDetail", { id: item.id }))}
              >
                {selectMode && <Ionicons name={selected ? "checkbox" : "square-outline"} size={20} color={selected ? colors.primary : colors.textMuted} style={{ marginRight: 10 }} />}
                <View style={{ flex: 1 }}>
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
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {selectMode && selectedIds.size > 0 && (
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, padding: spacing.md, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "700" }}>{selectedIds.size} selected</Text>
          <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 9 }} onPress={() => setBulkStatusPickerOpen(true)}>
            <Text style={{ color: colors.text, fontSize: 12.5 }}>{ASSET_STATUS_OPTIONS.find((s) => s.value === bulkStatus)?.label}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 9 }} disabled={bulkMutation.isPending} onPress={() => bulkMutation.mutate()}>
            {bulkMutation.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>Apply</Text>}
          </TouchableOpacity>
        </View>
      )}

      {canCreate && !selectMode && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: colors.primary, borderRadius: radius.pill }]}
          onPress={() => navigation.navigate("AssetForm", undefined)}
        >
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      )}

      <PickerModal visible={bulkStatusPickerOpen} title="Set status to" options={statusOptions} selectedId={bulkStatus} onSelect={(id) => setBulkStatus(id as Asset["status"])} onClose={() => setBulkStatusPickerOpen(false)} />
      <CustomColumnsSheet visible={showCustomColumns} entityType="Asset" title="Asset Custom Columns" onClose={() => setShowCustomColumns(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  searchBox: { flex: 1, flexDirection: "row", alignItems: "center", borderWidth: 1, paddingHorizontal: 12, height: 42 },
  iconButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  fab: { position: "absolute", right: 20, bottom: 20, width: 56, height: 56, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
});

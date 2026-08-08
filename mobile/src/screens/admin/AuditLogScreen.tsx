import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ActivityIndicator, FlatList, RefreshControl, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { ShimmerList } from "../../components/Shimmer";

interface AuditRow {
  id: number;
  action: string;
  entityType: string | null;
  entityId: number | null;
  createdAt: string;
  user: { firstName: string; lastName: string; email: string } | null;
}

interface PaginatedResponse {
  items: AuditRow[];
  page: number;
  totalPages: number;
}

const PAGE_SIZE = 25;

// Mirrors client/src/pages/admin/AuditLogTab.tsx — the admin-action audit trail, distinct from the
// mobile AgentLogScreen (relay-agent activity only).
export function AuditLogScreen() {
  const { colors, spacing, radius } = useTheme();
  const [search, setSearch] = useState("");

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch, isRefetching } = useInfiniteQuery({
    queryKey: ["mobile-audit-log", search],
    queryFn: async ({ pageParam }) => {
      const res = await axiosClient.get("/audit", { params: { page: pageParam, pageSize: PAGE_SIZE, search: search || undefined } });
      return res.data as PaginatedResponse;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined),
  });

  const rows = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 12, height: 42 }}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            style={{ flex: 1, marginLeft: 8, color: colors.text }}
            placeholder="Search by action, entity, or user..."
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      {isLoading ? (
        <ShimmerList />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => hasNextPage && fetchNextPage()}
          ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: 16 }} color={colors.primary} /> : null}
          ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 40 }}>No audit entries yet.</Text>}
          renderItem={({ item }) => (
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>{item.action}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 10.5 }}>{dayjs(item.createdAt).format("DD MMM YYYY, HH:mm")}</Text>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 3 }}>
                {item.user ? `${item.user.firstName} ${item.user.lastName}` : "System"}
                {item.entityType ? ` · ${item.entityType} #${item.entityId}` : ""}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

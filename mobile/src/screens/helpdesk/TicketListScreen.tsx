import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useAuth } from "../../auth/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { TicketPriorityPill, TicketStatusPill } from "../../components/TicketPills";
import { PaginatedResponse } from "../../types/asset";
import { Ticket, TicketStatus, TICKET_STATUS_OPTIONS } from "../../types/ticket";
import { HelpdeskStackParamList } from "../../navigation/types";

const PAGE_SIZE = 25;

export function TicketListScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<HelpdeskStackParamList>>();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TicketStatus | null>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch, isRefetching } = useInfiniteQuery({
    queryKey: ["mobile-tickets", search, status],
    queryFn: async ({ pageParam }) => {
      const res = await axiosClient.get("/tickets", {
        params: { page: pageParam, pageSize: PAGE_SIZE, search: search || undefined, status: status ?? undefined },
      });
      return res.data as PaginatedResponse<Ticket>;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined),
  });

  const tickets = data?.pages.flatMap((p) => p.items) ?? [];
  const canCreate = hasPermission("helpdesk", "create");

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm }}>
        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md }]}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            style={{ flex: 1, marginLeft: 8, color: colors.text }}
            placeholder="Search tickets..."
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[{ value: null, label: "All" }, ...TICKET_STATUS_OPTIONS]}
          keyExtractor={(s) => String(s.value)}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => {
            const active = status === item.value;
            return (
              <TouchableOpacity
                onPress={() => setStatus(item.value as TicketStatus | null)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: radius.pill,
                  backgroundColor: active ? colors.primary : colors.surface,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                }}
              >
                <Text style={{ color: active ? "#fff" : colors.text, fontSize: 12.5, fontWeight: "600" }}>{item.label}</Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => hasNextPage && fetchNextPage()}
          ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: 16 }} color={colors.primary} /> : null}
          ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 40 }}>No tickets found.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}
              onPress={() => navigation.navigate("TicketDetail", { id: item.id })}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700" }}>{item.ticketNumber}</Text>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700", marginTop: 2 }} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                    {item.requester ? `${item.requester.firstName} ${item.requester.lastName} · ` : ""}
                    {dayjs(item.createdAt).format("DD MMM YYYY")}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <TicketStatusPill status={item.status} />
                  <TicketPriorityPill priority={item.priority} />
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {canCreate && (
        <TouchableOpacity style={[styles.fab, { backgroundColor: colors.primary, borderRadius: radius.pill }]} onPress={() => navigation.navigate("TicketForm")}>
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchBox: { flexDirection: "row", alignItems: "center", borderWidth: 1, paddingHorizontal: 12, height: 42 },
  fab: { position: "absolute", right: 20, bottom: 20, width: 56, height: 56, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
});

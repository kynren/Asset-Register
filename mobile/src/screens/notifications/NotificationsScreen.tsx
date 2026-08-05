import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { FlatList, RefreshControl, Text, TouchableOpacity, View } from "react-native";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";

interface NotificationItem {
  id: number;
  type: string;
  message: string;
  isRead: boolean;
  linkUrl: string | null;
  createdAt: string;
}

export function NotificationsScreen() {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["mobile-notifications"],
    queryFn: async () => (await axiosClient.get("/notifications/all")).data.notifications as NotificationItem[],
  });

  async function markRead(id: number) {
    await axiosClient.post(`/notifications/${id}/read`);
    queryClient.invalidateQueries({ queryKey: ["mobile-notifications"] });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={data ?? []}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
        ListEmptyComponent={
          !isLoading ? (
            <Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 40 }}>No notifications yet.</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => !item.isRead && markRead(item.id)}
            style={{
              backgroundColor: colors.surface,
              borderRadius: radius.md,
              padding: spacing.md,
              borderWidth: 1,
              borderColor: item.isRead ? colors.border : colors.primary,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: item.isRead ? "400" : "700" }}>{item.message}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>{dayjs(item.createdAt).format("DD MMM YYYY HH:mm")}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, Alert, FlatList, RefreshControl, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useAuth } from "../../auth/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { AssetBooking } from "../../types/operations";
import { MoreStackParamList } from "../../navigation/types";

export function BookingListScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const queryClient = useQueryClient();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["mobile-bookings"],
    queryFn: async () => (await axiosClient.get("/operations/bookings")).data as AssetBooking[],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/operations/bookings/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-bookings"] }),
  });

  function confirmDelete(booking: AssetBooking) {
    Alert.alert("Cancel booking", `Cancel the booking for "${booking.asset.name}"?`, [
      { text: "Keep it", style: "cancel" },
      { text: "Cancel booking", style: "destructive", onPress: () => deleteMutation.mutate(booking.id) },
    ]);
  }

  const bookings = data ?? [];
  const canCreate = hasPermission("operations", "create");
  const canDelete = hasPermission("operations", "delete");

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 40 }}>No bookings found.</Text>}
          renderItem={({ item }) => (
            <View style={{ flexDirection: "row", alignItems: "flex-start", backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{item.asset.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{item.asset.assetTag}</Text>
                <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "600", marginTop: 6 }}>
                  {dayjs(item.startAt).format("DD MMM HH:mm")} → {dayjs(item.endAt).format("DD MMM HH:mm")}
                </Text>
                {item.purpose && <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{item.purpose}</Text>}
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
                  Booked by {item.bookedBy.firstName} {item.bookedBy.lastName}
                </Text>
              </View>
              {canDelete && (
                <TouchableOpacity onPress={() => confirmDelete(item)} style={{ padding: 4 }}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      )}

      {canCreate && (
        <TouchableOpacity
          style={{ position: "absolute", right: 20, bottom: 20, width: 56, height: 56, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.primary, elevation: 4, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } }}
          onPress={() => navigation.navigate("BookingForm")}
        >
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

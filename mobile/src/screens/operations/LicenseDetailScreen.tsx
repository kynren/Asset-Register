import { useLayoutEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { Alert, FlatList, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { MoreStackParamList } from "../../navigation/types";
import { License } from "./LicenseListScreen";

interface Assignment {
  id: number;
  asset: { id: number; assetTag: string; name: string } | null;
  user: { id: number; firstName: string; lastName: string } | null;
}
interface DirectoryUser {
  id: number;
  firstName: string;
  lastName: string;
}

export function LicenseDetailScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<MoreStackParamList, "LicenseDetail">>();
  const queryClient = useQueryClient();
  const { id } = route.params;
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: license } = useQuery({
    queryKey: ["mobile-license", id],
    queryFn: async () => (await axiosClient.get(`/licenses`)).data.find((l: License) => l.id === id) as License | undefined,
  });
  const { data: assignments, isLoading } = useQuery({
    queryKey: ["mobile-license-assignments", id],
    queryFn: async () => (await axiosClient.get(`/licenses/${id}/assignments`)).data as Assignment[],
  });
  const { data: users } = useQuery({
    queryKey: ["mobile-users-directory"],
    queryFn: async () => (await axiosClient.get("/users/directory")).data as DirectoryUser[],
  });

  const assignMutation = useMutation({
    mutationFn: (userId: number) => axiosClient.post(`/licenses/${id}/assignments`, { userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-license-assignments", id] });
      queryClient.invalidateQueries({ queryKey: ["mobile-licenses"] });
    },
  });

  const unassignMutation = useMutation({
    mutationFn: (assignmentId: number) => axiosClient.delete(`/licenses/${id}/assignments/${assignmentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-license-assignments", id] });
      queryClient.invalidateQueries({ queryKey: ["mobile-licenses"] });
    },
  });

  useLayoutEffect(() => {
    navigation.setOptions({ title: license?.name ?? "License" });
  }, [navigation, license]);

  function confirmUnassign(a: Assignment) {
    const label = a.user ? `${a.user.firstName} ${a.user.lastName}` : a.asset ? a.asset.name : "this assignment";
    Alert.alert("Unassign license", `Unassign this license from "${label}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Unassign", style: "destructive", onPress: () => unassignMutation.mutate(a.id) },
    ]);
  }

  const seatsFull = license ? license.seatsUsed >= license.seats : false;
  const userOptions: PickerOption[] = (users ?? []).map((u) => ({ id: u.id, label: `${u.firstName} ${u.lastName}` }));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        data={assignments ?? []}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.md }}>
            {license && (
              <View style={{ flexDirection: "row", gap: 6, marginBottom: spacing.md }}>
                <View style={{ backgroundColor: seatsFull ? colors.danger + "22" : colors.success + "22", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: seatsFull ? colors.danger : colors.success, fontSize: 11, fontWeight: "700" }}>{license.seatsUsed}/{license.seats} seats</Text>
                </View>
                {license.vendor && (
                  <View style={{ backgroundColor: colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700" }}>{license.vendor}</Text>
                  </View>
                )}
              </View>
            )}
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 12, opacity: seatsFull ? 0.5 : 1 }}
              disabled={seatsFull}
              onPress={() => setPickerOpen(true)}
            >
              <Ionicons name="person-add-outline" size={16} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{seatsFull ? "All seats assigned" : "Assign to user"}</Text>
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={!isLoading ? <Text style={{ color: colors.textMuted, textAlign: "center" }}>No seats assigned yet.</Text> : null}
        renderItem={({ item }) => (
          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: 6 }}>
            <Text style={{ flex: 1, color: colors.text, fontSize: 13, fontWeight: "600" }}>
              {item.user ? `${item.user.firstName} ${item.user.lastName}` : item.asset ? `${item.asset.name} (${item.asset.assetTag})` : "Unknown"}
            </Text>
            <TouchableOpacity onPress={() => confirmUnassign(item)} style={{ padding: 6 }}>
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </TouchableOpacity>
          </View>
        )}
      />
      <PickerModal
        visible={pickerOpen}
        title="Assign to user"
        options={userOptions}
        searchable
        onSelect={(v) => v != null && assignMutation.mutate(Number(v))}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

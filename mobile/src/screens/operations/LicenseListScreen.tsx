import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Alert, FlatList, RefreshControl, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { ShimmerList } from "../../components/Shimmer";
import { MoreStackParamList } from "../../navigation/types";

export interface License {
  id: number;
  name: string;
  vendor: string | null;
  seats: number;
  seatsUsed: number;
  expiresAt: string | null;
}

export function LicenseListScreen() {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const [name, setName] = useState("");
  const [vendor, setVendor] = useState("");
  const [seats, setSeats] = useState("1");

  const { data: licenses, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["mobile-licenses"],
    queryFn: async () => (await axiosClient.get("/licenses")).data as License[],
  });

  const createMutation = useMutation({
    mutationFn: () => axiosClient.post("/licenses", { name, vendor: vendor || undefined, seats: Number(seats) || 1 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-licenses"] });
      setName("");
      setVendor("");
      setSeats("1");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/licenses/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-licenses"] }),
  });

  function confirmDelete(l: License) {
    Alert.alert("Delete license", `Delete "${l.name}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(l.id) },
    ]);
  }

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: colors.text, backgroundColor: colors.surface };

  if (isLoading) return <ShimmerList />;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 8, marginBottom: spacing.md }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" }}>Add Software License</Text>
          <TextInput style={inputStyle} placeholder="Name (e.g. Microsoft 365 E3)" placeholderTextColor={colors.textMuted} value={name} onChangeText={setName} />
          <TextInput style={inputStyle} placeholder="Vendor" placeholderTextColor={colors.textMuted} value={vendor} onChangeText={setVendor} />
          <TextInput style={inputStyle} placeholder="Seats" placeholderTextColor={colors.textMuted} keyboardType="number-pad" value={seats} onChangeText={setSeats} />
          <TouchableOpacity
            style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 10, opacity: name ? 1 : 0.5 }}
            disabled={!name.trim() || createMutation.isPending}
            onPress={() => createMutation.mutate()}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{createMutation.isPending ? "Adding..." : "Add License"}</Text>
          </TouchableOpacity>
        </View>
      }
      data={licenses ?? []}
      keyExtractor={(item) => String(item.id)}
      ListEmptyComponent={!isLoading ? <Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 12 }}>No software licenses tracked yet.</Text> : null}
      renderItem={({ item }) => {
        const seatsFull = item.seatsUsed >= item.seats;
        const expiringSoon = item.expiresAt && dayjs(item.expiresAt).diff(dayjs(), "day") <= 30;
        return (
          <TouchableOpacity
            style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: 6 }}
            onPress={() => navigation.navigate("LicenseDetail", { id: item.id })}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>{item.name}</Text>
                {item.vendor && <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{item.vendor}</Text>}
              </View>
              <TouchableOpacity onPress={() => confirmDelete(item)} style={{ padding: 4 }}>
                <Ionicons name="trash-outline" size={16} color={colors.danger} />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <View style={{ backgroundColor: seatsFull ? colors.danger + "22" : colors.success + "22", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ color: seatsFull ? colors.danger : colors.success, fontSize: 10.5, fontWeight: "700" }}>{item.seatsUsed}/{item.seats} seats</Text>
              </View>
              {expiringSoon && (
                <View style={{ backgroundColor: colors.warning + "22", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: colors.warning, fontSize: 10.5, fontWeight: "700" }}>Expires {dayjs(item.expiresAt).format("DD MMM YYYY")}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        );
      }}
    />
  );
}

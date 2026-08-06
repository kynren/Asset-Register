import { useLayoutEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useAuth } from "../../auth/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { ShimmerDetail } from "../../components/Shimmer";
import { StockItem } from "../../types/stock";
import { StockStackParamList } from "../../navigation/types";

export function StockDetailScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<StockStackParamList>>();
  const route = useRoute<RouteProp<StockStackParamList, "StockDetail">>();
  const { id } = route.params;
  const queryClient = useQueryClient();

  const { data: item, isLoading } = useQuery({
    queryKey: ["mobile-stock-item", id],
    queryFn: async () => (await axiosClient.get(`/stock/${id}`)).data as StockItem,
  });

  const deleteMutation = useMutation({
    mutationFn: () => axiosClient.delete(`/stock/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-stock"] });
      navigation.goBack();
    },
  });

  function confirmDelete() {
    Alert.alert("Delete stock item", `Delete "${item?.name}"? This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate() },
    ]);
  }

  useLayoutEffect(() => {
    navigation.setOptions({
      title: item?.name ?? "Stock Item",
      headerRight: () =>
        hasPermission("stock", "edit") ? (
          <TouchableOpacity onPress={() => navigation.navigate("StockForm", { id })} style={{ paddingHorizontal: 4 }}>
            <Ionicons name="create-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
        ) : null,
    });
  }, [navigation, item, id, colors.primary]);

  if (isLoading || !item) {
    return <ShimmerDetail />;
  }

  const low = item.quantityOnHand <= item.reorderLevel;
  const rows: [string, string | null][] = [
    ["Type / Category", item.stockItemType?.name ?? item.category ?? "—"],
    ["Unit", item.unit],
    ["Reorder level", `${item.reorderLevel} ${item.unit}`],
    ["Unit cost", item.unitCost != null ? `£${item.unitCost}` : null],
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={{ alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.lg }}>
        <QRCode value={item.sku} size={140} backgroundColor={colors.surface} color={colors.text} />
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800", marginTop: spacing.md }}>{item.name}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>{item.sku}</Text>
        <Text style={{ color: low ? colors.danger : colors.success, fontSize: 22, fontWeight: "800", marginTop: spacing.sm }}>
          {item.quantityOnHand} {item.unit}
        </Text>
        {low && <Text style={{ color: colors.danger, fontSize: 11, fontWeight: "700" }}>LOW STOCK — reorder soon</Text>}
      </View>

      {hasPermission("stock", "edit") && (
        <TouchableOpacity
          style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 13, marginBottom: spacing.lg }}
          onPress={() => navigation.navigate("StockAdjust", { id })}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>Adjust stock (in / out)</Text>
        </TouchableOpacity>
      )}

      <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg }}>
        {rows
          .filter(([, v]) => v !== null)
          .map(([label, value], i, arr) => (
            <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{label}</Text>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{value}</Text>
            </View>
          ))}
      </View>

      {!!item.transactions?.length && (
        <View style={{ marginTop: spacing.lg }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", marginBottom: 8 }}>Recent activity</Text>
          {item.transactions.slice(0, 10).map((t) => (
            <View key={t.id} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>
                  {t.type === "IN" ? "+" : "-"}
                  {t.quantity} {item.unit}
                  {t.reason ? ` · ${t.reason}` : ""}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                  {t.performedBy ? `${t.performedBy.firstName} ${t.performedBy.lastName} · ` : ""}
                  {dayjs(t.createdAt).format("DD MMM YYYY HH:mm")}
                </Text>
              </View>
              <Ionicons name={t.type === "IN" ? "arrow-down-circle" : "arrow-up-circle"} size={20} color={t.type === "IN" ? colors.success : colors.warning} />
            </View>
          ))}
        </View>
      )}

      {hasPermission("stock", "delete") && (
        <TouchableOpacity
          style={{ marginTop: spacing.xl, borderWidth: 1.5, borderColor: colors.danger, borderRadius: radius.md, alignItems: "center", paddingVertical: 14 }}
          onPress={confirmDelete}
          disabled={deleteMutation.isPending}
        >
          <Text style={{ color: colors.danger, fontWeight: "700" }}>Delete stock item</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

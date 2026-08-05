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
import { StatusBadge } from "../../components/StatusBadge";
import { Asset } from "../../types/asset";
import { AssetsStackParamList } from "../../navigation/types";

export function AssetDetailScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<AssetsStackParamList>>();
  const route = useRoute<RouteProp<AssetsStackParamList, "AssetDetail">>();
  const { id } = route.params;
  const queryClient = useQueryClient();

  const { data: asset, isLoading } = useQuery({
    queryKey: ["mobile-asset", id],
    queryFn: async () => (await axiosClient.get(`/assets/${id}`)).data as Asset,
  });

  const deleteMutation = useMutation({
    mutationFn: () => axiosClient.delete(`/assets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-assets"] });
      navigation.goBack();
    },
  });

  function confirmDelete() {
    Alert.alert("Delete asset", `Delete "${asset?.name}"? This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate() },
    ]);
  }

  useLayoutEffect(() => {
    navigation.setOptions({
      title: asset?.name ?? "Asset",
      headerRight: () =>
        hasPermission("assets", "edit") ? (
          <TouchableOpacity onPress={() => navigation.navigate("AssetForm", { id })} style={{ paddingHorizontal: 4 }}>
            <Ionicons name="create-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
        ) : null,
    });
  }, [navigation, asset, id, colors.primary]);

  if (isLoading || !asset) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const rows: [string, string | null][] = [
    ["Category", asset.category?.name ?? "—"],
    ["Location", asset.location?.name ?? "—"],
    ["Assigned to", asset.assignedTo ? `${asset.assignedTo.firstName} ${asset.assignedTo.lastName}` : "—"],
    ["Manufacturer", asset.manufacturer],
    ["Model", asset.model],
    ["Serial number", asset.serialNumber],
    ["Supplier", asset.supplier],
    ["Purchase date", asset.purchaseDate ? dayjs(asset.purchaseDate).format("DD MMM YYYY") : null],
    ["Purchase cost", asset.purchaseCost != null ? `£${asset.purchaseCost}` : null],
    ["Warranty expires", asset.warrantyExpiresAt ? dayjs(asset.warrantyExpiresAt).format("DD MMM YYYY") : null],
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={{ alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.lg }}>
        <QRCode value={asset.assetTag} size={140} backgroundColor={colors.surface} color={colors.text} />
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800", marginTop: spacing.md }}>{asset.name}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>{asset.assetTag}</Text>
        <View style={{ marginTop: spacing.sm }}>
          <StatusBadge status={asset.status} />
        </View>
      </View>

      <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg }}>
        {rows
          .filter(([, v]) => v !== null && v !== undefined)
          .map(([label, value], i, arr) => (
            <View
              key={label}
              style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: colors.border }}
            >
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{label}</Text>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600", flexShrink: 1, textAlign: "right" }}>{value}</Text>
            </View>
          ))}
      </View>

      {asset.notes ? (
        <View style={{ marginTop: spacing.lg }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", marginBottom: 6 }}>Notes</Text>
          <Text style={{ color: colors.text, fontSize: 13, lineHeight: 19 }}>{asset.notes}</Text>
        </View>
      ) : null}

      {hasPermission("assets", "delete") && (
        <TouchableOpacity
          style={{ marginTop: spacing.xl, borderWidth: 1.5, borderColor: colors.danger, borderRadius: radius.md, alignItems: "center", paddingVertical: 14 }}
          onPress={confirmDelete}
          disabled={deleteMutation.isPending}
        >
          <Text style={{ color: colors.danger, fontWeight: "700" }}>Delete asset</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

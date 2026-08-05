import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from "react-native";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { StockItem } from "../../types/stock";
import { AssetLocation } from "../../types/asset";
import { StockStackParamList } from "../../navigation/types";

export function StockAdjustScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<StockStackParamList>>();
  const route = useRoute<RouteProp<StockStackParamList, "StockAdjust">>();
  const { id } = route.params;
  const queryClient = useQueryClient();

  const { data: item } = useQuery({
    queryKey: ["mobile-stock-item", id],
    queryFn: async () => (await axiosClient.get(`/stock/${id}`)).data as StockItem,
  });
  const { data: locations } = useQuery({
    queryKey: ["mobile-locations"],
    queryFn: async () => (await axiosClient.get("/locations")).data as AssetLocation[],
  });

  const [type, setType] = useState<"IN" | "OUT">("OUT");
  const [quantity, setQuantity] = useState("");
  const [locationId, setLocationId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (item?.locationId && locationId === null) setLocationId(item.locationId);
  }, [item, locationId]);

  const mutation = useMutation({
    mutationFn: () => axiosClient.post(`/stock/${id}/transactions`, { type, quantity: Number(quantity), locationId, reason: reason || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-stock-item", id] });
      queryClient.invalidateQueries({ queryKey: ["mobile-stock"] });
      navigation.goBack();
    },
    onError: (err: any) => setError(err?.response?.data?.error ?? "Failed to record transaction."),
  });

  const locationOptions: PickerOption[] = (locations ?? []).map((l) => ({ id: l.id, label: l.name }));
  const locationLabel = locations?.find((l) => l.id === locationId)?.name ?? "Select a location";
  const canSubmit = !!quantity && Number(quantity) > 0 && locationId != null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg }}>
      {error && (
        <View style={{ backgroundColor: colors.danger + "22", borderRadius: radius.md, padding: 12, marginBottom: spacing.md }}>
          <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text>
        </View>
      )}

      {item && (
        <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: spacing.lg }}>
          {item.name} · currently {item.quantityOnHand} {item.unit} on hand
        </Text>
      )}

      <View style={{ flexDirection: "row", gap: 10, marginBottom: spacing.lg }}>
        {(["OUT", "IN"] as const).map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setType(t)}
            style={{
              flex: 1,
              alignItems: "center",
              paddingVertical: 14,
              borderRadius: radius.md,
              borderWidth: 1.5,
              borderColor: type === t ? (t === "IN" ? colors.success : colors.warning) : colors.border,
              backgroundColor: type === t ? (t === "IN" ? colors.success + "22" : colors.warning + "22") : colors.surface,
            }}
          >
            <Text style={{ color: type === t ? (t === "IN" ? colors.success : colors.warning) : colors.text, fontWeight: "700" }}>
              {t === "IN" ? "Stock In (+)" : "Stock Out (-)"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 6, textTransform: "uppercase" }}>Quantity *</Text>
      <TextInput
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, fontWeight: "700", color: colors.text, backgroundColor: colors.surface, marginBottom: 14 }}
        keyboardType="number-pad"
        placeholder="0"
        placeholderTextColor={colors.textMuted}
        value={quantity}
        onChangeText={setQuantity}
      />

      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 6, textTransform: "uppercase" }}>Location *</Text>
      <TouchableOpacity
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surface, marginBottom: 14 }}
        onPress={() => setPickerOpen(true)}
      >
        <Text style={{ color: colors.text, fontSize: 14 }}>{locationLabel}</Text>
      </TouchableOpacity>

      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 6, textTransform: "uppercase" }}>Reason (optional)</Text>
      <TextInput
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface, marginBottom: 14 }}
        placeholder="e.g. Issued for job #123"
        placeholderTextColor={colors.textMuted}
        value={reason}
        onChangeText={setReason}
      />

      <TouchableOpacity
        style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 15, marginTop: spacing.md }}
        disabled={!canSubmit || mutation.isPending}
        onPress={() => mutation.mutate()}
      >
        {mutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Record {type === "IN" ? "stock in" : "stock out"}</Text>}
      </TouchableOpacity>

      <PickerModal visible={pickerOpen} title="Location" options={locationOptions} selectedId={locationId} onSelect={(idVal) => setLocationId(idVal as number)} onClose={() => setPickerOpen(false)} />
    </View>
  );
}

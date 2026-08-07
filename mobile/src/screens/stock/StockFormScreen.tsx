import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { KeyboardAvoidingScreen } from "../../components/KeyboardAvoidingScreen";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { ShimmerDetail } from "../../components/Shimmer";
import { StockItem, StockItemType } from "../../types/stock";
import { AssetLocation } from "../../types/asset";
import { StockStackParamList } from "../../navigation/types";

type PickerKey = "type" | "location" | null;

export function StockFormScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<StockStackParamList>>();
  const route = useRoute<RouteProp<StockStackParamList, "StockForm">>();
  const editingId = route.params?.id;
  const queryClient = useQueryClient();

  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [stockItemTypeId, setStockItemTypeId] = useState<number | null>(null);
  const [unit, setUnit] = useState("pcs");
  const [reorderLevel, setReorderLevel] = useState("0");
  const [unitCost, setUnitCost] = useState("");
  const [locationId, setLocationId] = useState<number | null>(null);
  const [openPicker, setOpenPicker] = useState<PickerKey>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: existing, isLoading: loadingExisting } = useQuery({
    queryKey: ["mobile-stock-item", editingId],
    queryFn: async () => (await axiosClient.get(`/stock/${editingId}`)).data as StockItem,
    enabled: !!editingId,
  });

  const { data: types } = useQuery({
    queryKey: ["mobile-stock-item-types"],
    queryFn: async () => (await axiosClient.get("/stock-item-types")).data as StockItemType[],
  });
  const { data: locations } = useQuery({
    queryKey: ["mobile-locations"],
    queryFn: async () => (await axiosClient.get("/locations")).data as AssetLocation[],
  });

  useEffect(() => {
    if (!existing) return;
    setSku(existing.sku);
    setName(existing.name);
    setStockItemTypeId(existing.stockItemTypeId);
    setUnit(existing.unit);
    setReorderLevel(String(existing.reorderLevel));
    setUnitCost(existing.unitCost != null ? String(existing.unitCost) : "");
    setLocationId(existing.locationId);
  }, [existing]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        sku: sku || undefined,
        name,
        stockItemTypeId,
        unit: unit || undefined,
        reorderLevel: Number(reorderLevel) || 0,
        unitCost: unitCost ? Number(unitCost) : null,
        locationId,
      };
      if (editingId) return axiosClient.patch(`/stock/${editingId}`, payload);
      return axiosClient.post("/stock", payload);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["mobile-stock"] });
      queryClient.invalidateQueries({ queryKey: ["mobile-stock-item", editingId] });
      navigation.replace("StockDetail", { id: editingId ?? res.data.id });
    },
    onError: (err: any) => setError(err?.response?.data?.error ?? "Failed to save stock item."),
  });

  if (editingId && loadingExisting) {
    return <ShimmerDetail />;
  }

  const typeOptions: PickerOption[] = (types ?? []).map((t) => ({ id: t.id, label: t.name }));
  const locationOptions: PickerOption[] = (locations ?? []).map((l) => ({ id: l.id, label: l.name }));
  const typeLabel = types?.find((t) => t.id === stockItemTypeId)?.name ?? "None";
  const locationLabel = locations?.find((l) => l.id === locationId)?.name ?? "None";

  return (
    <KeyboardAvoidingScreen>
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      {error && (
        <View style={{ backgroundColor: colors.danger + "22", borderRadius: radius.md, padding: 12, marginBottom: spacing.md }}>
          <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text>
        </View>
      )}

      <Field label="Name *" colors={colors}>
        <TextInput style={fieldInputStyle(colors, radius)} placeholder="e.g. Ethernet Cable Cat6 5m" placeholderTextColor={colors.textMuted} value={name} onChangeText={setName} />
      </Field>

      <Field label={editingId ? "SKU" : "SKU (leave blank to auto-generate)"} colors={colors}>
        <TextInput style={fieldInputStyle(colors, radius)} placeholder="Auto-generated from type" placeholderTextColor={colors.textMuted} value={sku} onChangeText={setSku} autoCapitalize="characters" />
      </Field>

      <PickerField label="Type" value={typeLabel} colors={colors} radius={radius} onPress={() => setOpenPicker("type")} />
      <PickerField label="Location" value={locationLabel} colors={colors} radius={radius} onPress={() => setOpenPicker("location")} />

      <Field label="Unit" colors={colors}>
        <TextInput style={fieldInputStyle(colors, radius)} placeholder="pcs" placeholderTextColor={colors.textMuted} value={unit} onChangeText={setUnit} />
      </Field>
      <Field label="Reorder level" colors={colors}>
        <TextInput style={fieldInputStyle(colors, radius)} keyboardType="number-pad" placeholderTextColor={colors.textMuted} value={reorderLevel} onChangeText={setReorderLevel} />
      </Field>
      <Field label="Unit cost" colors={colors}>
        <TextInput style={fieldInputStyle(colors, radius)} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textMuted} value={unitCost} onChangeText={setUnitCost} />
      </Field>

      <TouchableOpacity
        style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 15, marginTop: spacing.lg }}
        disabled={!name || mutation.isPending}
        onPress={() => mutation.mutate()}
      >
        {mutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>{editingId ? "Save changes" : "Create stock item"}</Text>}
      </TouchableOpacity>

      <PickerModal visible={openPicker === "type"} title="Type" options={typeOptions} selectedId={stockItemTypeId} allowClear searchable onSelect={(id) => setStockItemTypeId(id as number | null)} onClose={() => setOpenPicker(null)} />
      <PickerModal visible={openPicker === "location"} title="Location" options={locationOptions} selectedId={locationId} allowClear searchable onSelect={(id) => setLocationId(id as number | null)} onClose={() => setOpenPicker(null)} />
    </ScrollView>
    </KeyboardAvoidingScreen>
  );
}

function Field({ label, colors, children }: { label: string; colors: any; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</Text>
      {children}
    </View>
  );
}

function PickerField({ label, value, colors, radius, onPress }: { label: string; value: string; colors: any; radius: any; onPress: () => void }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</Text>
      <TouchableOpacity
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surface }}
        onPress={onPress}
      >
        <Text style={{ color: colors.text, fontSize: 14 }}>{value}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

function fieldInputStyle(colors: any, radius: any) {
  return { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface };
}

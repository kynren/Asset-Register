import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute, RouteProp } from "@react-navigation/native";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { ShimmerDetail } from "../../components/Shimmer";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { Asset, ASSET_STATUS_OPTIONS } from "../../types/asset";
import { AssetsStackParamList } from "../../navigation/types";

const SIGN_OFF_OPTIONS: PickerOption[] = [{ id: "PENDING", label: "Pending" }, { id: "CONFIRMED", label: "Confirmed" }];

// Combines client/src/pages/assets/detail/ManagementTab.tsx (status/sign-off/notes) and
// AssetFinancialTab.tsx (supplier/invoice/purchase/warranty/service) into one PATCH — both write
// to the same /assets/:id endpoint, so a single save covers both sections.
export function AssetManagementScreen() {
  const { colors, spacing, radius } = useTheme();
  const route = useRoute<RouteProp<AssetsStackParamList, "AssetManagement">>();
  const { assetId } = route.params;
  const queryClient = useQueryClient();

  const { data: asset, isLoading } = useQuery({ queryKey: ["mobile-asset", assetId], queryFn: async () => (await axiosClient.get(`/assets/${assetId}`)).data as Asset });

  const [status, setStatus] = useState<Asset["status"]>("IN_STORAGE");
  const [signOffStatus, setSignOffStatus] = useState<"PENDING" | "CONFIRMED">("PENDING");
  const [notes, setNotes] = useState("");
  const [supplier, setSupplier] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [purchaseCost, setPurchaseCost] = useState("");
  const [warrantyExpiresAt, setWarrantyExpiresAt] = useState("");
  const [nextServiceDate, setNextServiceDate] = useState("");
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [signOffPickerOpen, setSignOffPickerOpen] = useState(false);

  useEffect(() => {
    if (!asset) return;
    setStatus(asset.status);
    setSignOffStatus(asset.signOffStatus);
    setNotes(asset.notes ?? "");
    setSupplier(asset.supplier ?? "");
    setInvoiceNumber(asset.invoiceNumber ?? "");
    setPurchaseDate(asset.purchaseDate ? asset.purchaseDate.slice(0, 10) : "");
    setPurchaseCost(asset.purchaseCost != null ? String(asset.purchaseCost) : "");
    setWarrantyExpiresAt(asset.warrantyExpiresAt ? asset.warrantyExpiresAt.slice(0, 10) : "");
    setNextServiceDate(asset.nextServiceDate ? asset.nextServiceDate.slice(0, 10) : "");
  }, [asset?.id, asset?.updatedAt]);

  const saveMutation = useMutation({
    mutationFn: () =>
      axiosClient.patch(`/assets/${assetId}`, {
        status, signOffStatus, notes,
        supplier: supplier || null, invoiceNumber: invoiceNumber || null,
        purchaseDate: purchaseDate ? new Date(purchaseDate).toISOString() : null,
        purchaseCost: purchaseCost === "" ? null : Number(purchaseCost),
        warrantyExpiresAt: warrantyExpiresAt ? new Date(warrantyExpiresAt).toISOString() : null,
        nextServiceDate: nextServiceDate ? new Date(nextServiceDate).toISOString() : null,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-asset", assetId] }),
  });

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.bg };
  const statusOptions: PickerOption[] = ASSET_STATUS_OPTIONS.map((s) => ({ id: s.value, label: s.label }));

  if (isLoading || !asset) return <ShimmerDetail />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
      <View style={{ gap: 10 }}>
        <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase" }}>Management</Text>
        <TouchableOpacity style={inputStyle} onPress={() => setStatusPickerOpen(true)}>
          <Text style={{ color: colors.text, fontSize: 14 }}>{statusOptions.find((o) => o.id === status)?.label}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={inputStyle} onPress={() => setSignOffPickerOpen(true)}>
          <Text style={{ color: colors.text, fontSize: 14 }}>Sign-off: {SIGN_OFF_OPTIONS.find((o) => o.id === signOffStatus)?.label}</Text>
        </TouchableOpacity>
        <TextInput style={[inputStyle, { minHeight: 70, textAlignVertical: "top" }]} placeholder="Notes" placeholderTextColor={colors.textMuted} value={notes} onChangeText={setNotes} multiline />
      </View>

      <View style={{ gap: 10 }}>
        <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase" }}>Financial &amp; Administrative Info</Text>
        <TextInput style={inputStyle} placeholder="Supplier" placeholderTextColor={colors.textMuted} value={supplier} onChangeText={setSupplier} />
        <TextInput style={inputStyle} placeholder="Invoice Number" placeholderTextColor={colors.textMuted} value={invoiceNumber} onChangeText={setInvoiceNumber} />
        <TextInput style={inputStyle} placeholder="Purchase Date (YYYY-MM-DD)" placeholderTextColor={colors.textMuted} value={purchaseDate} onChangeText={setPurchaseDate} />
        <TextInput style={inputStyle} placeholder="Purchase Cost" placeholderTextColor={colors.textMuted} value={purchaseCost} onChangeText={setPurchaseCost} keyboardType="numeric" />
        <TextInput style={inputStyle} placeholder="Warranty Expires (YYYY-MM-DD)" placeholderTextColor={colors.textMuted} value={warrantyExpiresAt} onChangeText={setWarrantyExpiresAt} />
        <TextInput style={inputStyle} placeholder="Next Service Date (YYYY-MM-DD)" placeholderTextColor={colors.textMuted} value={nextServiceDate} onChangeText={setNextServiceDate} />
      </View>

      <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 13 }} disabled={saveMutation.isPending} onPress={() => saveMutation.mutate()}>
        {saveMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Save Changes</Text>}
      </TouchableOpacity>
      {saveMutation.isSuccess && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center" }}>
          <Ionicons name="checkmark-circle" size={14} color={colors.success} />
          <Text style={{ color: colors.success, fontSize: 12 }}>Saved</Text>
        </View>
      )}

      <PickerModal visible={statusPickerOpen} title="Status" options={statusOptions} selectedId={status} onSelect={(id) => setStatus(id as Asset["status"])} onClose={() => setStatusPickerOpen(false)} />
      <PickerModal visible={signOffPickerOpen} title="Sign-off Status" options={SIGN_OFF_OPTIONS} selectedId={signOffStatus} onSelect={(id) => setSignOffStatus(id as "PENDING" | "CONFIRMED")} onClose={() => setSignOffPickerOpen(false)} />
    </ScrollView>
  );
}

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { KeyboardAvoidingScreen } from "../../components/KeyboardAvoidingScreen";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { SignaturePad, SignaturePadHandle } from "../../components/SignaturePad";
import { downloadAndShare } from "../../lib/downloadFile";
import { StockItem } from "../../types/stock";
import { StockStackParamList } from "../../navigation/types";

// Mirrors client/src/pages/stock/StockItemDetailModal.tsx's Issue Stock flow: pick a location that
// actually has stock, a quantity within that location's on-hand, a recipient, and a drawn signature
// as proof of receipt — POST /stock/:id/issue (multipart) creates the audited StockIssuance record.
export function StockIssueScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<StockStackParamList>>();
  const route = useRoute<RouteProp<StockStackParamList, "StockIssue">>();
  const { id } = route.params;
  const queryClient = useQueryClient();
  const signatureRef = useRef<SignaturePadHandle>(null);

  const { data: item } = useQuery({
    queryKey: ["mobile-stock-item", id],
    queryFn: async () => (await axiosClient.get(`/stock/${id}`)).data as StockItem,
  });
  const { data: users } = useQuery({
    queryKey: ["mobile-users-directory"],
    queryFn: async () => (await axiosClient.get("/users/directory")).data as { id: number; firstName: string; lastName: string }[],
  });

  const [locationId, setLocationId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [receivedById, setReceivedById] = useState<number | null>(null);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [userPickerOpen, setUserPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSignature, setHasSignature] = useState(false);
  const [issuance, setIssuance] = useState<{ id: number } | null>(null);

  const issueMutation = useMutation({
    mutationFn: async () => {
      if (!item) throw new Error("Item not loaded");
      const signatureUri = await signatureRef.current!.exportAsync();
      const fd = new FormData();
      fd.append("scannedSku", item.sku);
      fd.append("quantity", quantity);
      fd.append("receivedById", String(receivedById));
      fd.append("locationId", String(locationId));
      fd.append("signature", { uri: signatureUri, name: "signature.png", type: "image/png" } as any);
      return axiosClient.post(`/stock/${id}/issue`, fd, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["mobile-stock-item", id] });
      queryClient.invalidateQueries({ queryKey: ["mobile-stock"] });
      setIssuance(res.data?.issuance ?? null);
    },
    onError: (err: any) => setError(err?.response?.data?.error ?? "Could not issue this stock."),
  });

  const levels = (item?.stockLevels ?? []).filter((l) => l.quantityOnHand > 0);
  const selectedLevel = levels.find((l) => l.locationId === locationId);
  const available = selectedLevel?.quantityOnHand ?? 0;
  const overQuantity = locationId != null && Number(quantity) > available;
  const canSubmit = locationId != null && receivedById != null && Number(quantity) > 0 && !overQuantity && hasSignature && !issueMutation.isPending;

  const locationOptions: PickerOption[] = levels.map((l) => ({ id: l.locationId, label: `${l.location.name} (${l.quantityOnHand} ${item?.unit ?? ""} available)` }));
  const userOptions: PickerOption[] = (users ?? []).map((u) => ({ id: u.id, label: `${u.firstName} ${u.lastName}` }));

  if (issuance) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="checkmark-circle" size={56} color={colors.success} />
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800", marginTop: spacing.md, textAlign: "center" }}>Stock issued successfully</Text>
        <TouchableOpacity
          style={{ backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 20, paddingVertical: 12, marginTop: spacing.xl }}
          onPress={() => downloadAndShare(`/stock/issuances/${issuance.id}/receipt.pdf`, `stock-issuance-${issuance.id}-receipt.pdf`)}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>Download Receipt</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ marginTop: spacing.lg }} onPress={() => navigation.goBack()}>
          <Text style={{ color: colors.textMuted, fontWeight: "700" }}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingScreen>
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      {item && (
        <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: spacing.lg }}>
          {item.name} ({item.sku})
        </Text>
      )}

      {error && (
        <View style={{ backgroundColor: colors.danger + "22", borderRadius: radius.md, padding: 12, marginBottom: spacing.md }}>
          <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text>
        </View>
      )}

      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 6, textTransform: "uppercase" }}>Location *</Text>
      {levels.length === 0 ? (
        <Text style={{ color: colors.danger, fontSize: 13, marginBottom: 14 }}>No stock available at any location.</Text>
      ) : (
        <TouchableOpacity
          style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surface, marginBottom: 14 }}
          onPress={() => setLocationPickerOpen(true)}
        >
          <Text style={{ color: locationId != null ? colors.text : colors.textMuted, fontSize: 14 }}>
            {locationOptions.find((o) => o.id === locationId)?.label ?? "Select a location"}
          </Text>
        </TouchableOpacity>
      )}

      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 6, textTransform: "uppercase" }}>Quantity *</Text>
      <TextInput
        style={{ borderWidth: 1, borderColor: overQuantity ? colors.danger : colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, fontWeight: "700", color: colors.text, backgroundColor: colors.surface }}
        keyboardType="number-pad"
        value={quantity}
        onChangeText={setQuantity}
      />
      {overQuantity && <Text style={{ color: colors.danger, fontSize: 12, marginTop: 4 }}>Only {available} {item?.unit} available at this location.</Text>}

      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginTop: 14, marginBottom: 6, textTransform: "uppercase" }}>Received by *</Text>
      <TouchableOpacity
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surface }}
        onPress={() => setUserPickerOpen(true)}
      >
        <Text style={{ color: receivedById != null ? colors.text : colors.textMuted, fontSize: 14 }}>
          {userOptions.find((o) => o.id === receivedById)?.label ?? "Select recipient"}
        </Text>
      </TouchableOpacity>

      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginTop: 14, marginBottom: 6, textTransform: "uppercase" }}>Recipient's Signature *</Text>
      <SignaturePad ref={signatureRef} onChange={setHasSignature} />

      <TouchableOpacity
        style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 15, marginTop: spacing.xl, opacity: canSubmit ? 1 : 0.5 }}
        disabled={!canSubmit}
        onPress={() => issueMutation.mutate()}
      >
        {issueMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Confirm Issue</Text>}
      </TouchableOpacity>

      <PickerModal visible={locationPickerOpen} title="Location" options={locationOptions} selectedId={locationId} onSelect={(v) => setLocationId(v as number)} onClose={() => setLocationPickerOpen(false)} />
      <PickerModal visible={userPickerOpen} title="Received by" options={userOptions} selectedId={receivedById} searchable onSelect={(v) => setReceivedById(v as number)} onClose={() => setUserPickerOpen(false)} />
    </ScrollView>
    </KeyboardAvoidingScreen>
  );
}

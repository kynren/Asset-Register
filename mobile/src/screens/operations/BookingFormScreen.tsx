import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { KeyboardAvoidingScreen } from "../../components/KeyboardAvoidingScreen";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { Asset, PaginatedResponse } from "../../types/asset";
import { MoreStackParamList } from "../../navigation/types";

// No native date-picker dependency is installed yet (see mobile/README.md's known gaps), so start/
// end are plain "YYYY-MM-DD HH:mm" text fields, parsed with dayjs before submit — matches the
// quick-capture scope of ProjectFormScreen rather than pulling in a new native module for one form.
const DATE_FORMAT = "YYYY-MM-DD HH:mm";

export function BookingFormScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const queryClient = useQueryClient();

  const [assetId, setAssetId] = useState<number | null>(null);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [purpose, setPurpose] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: assetsPage } = useQuery({
    queryKey: ["mobile-bookings-asset-options"],
    queryFn: async () => (await axiosClient.get("/assets", { params: { page: 1, pageSize: 100 } })).data as PaginatedResponse<Asset>,
  });
  const assets = assetsPage?.items ?? [];
  const assetOptions: PickerOption[] = assets.map((a) => ({ id: a.id, label: a.name, sublabel: a.assetTag }));
  const selectedAsset = assets.find((a) => a.id === assetId);

  const mutation = useMutation({
    mutationFn: () => {
      const start = dayjs(startAt, DATE_FORMAT, true);
      const end = dayjs(endAt, DATE_FORMAT, true);
      if (!start.isValid() || !end.isValid()) throw new Error(`Dates must be in ${DATE_FORMAT} format`);
      return axiosClient.post("/operations/bookings", {
        assetId,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        purpose: purpose || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-bookings"] });
      navigation.goBack();
    },
    onError: (err: any) => setError(err?.response?.data?.error ?? err?.message ?? "Failed to create booking."),
  });

  const canSubmit = assetId != null && startAt.trim().length > 0 && endAt.trim().length > 0;

  return (
    <KeyboardAvoidingScreen>
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      {error && (
        <View style={{ backgroundColor: colors.danger + "22", borderRadius: radius.md, padding: 12, marginBottom: spacing.md }}>
          <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text>
        </View>
      )}

      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 6, textTransform: "uppercase" }}>Asset *</Text>
      <TouchableOpacity
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surface, marginBottom: 14 }}
        onPress={() => setAssetPickerOpen(true)}
      >
        <Text style={{ color: selectedAsset ? colors.text : colors.textMuted, fontSize: 14 }}>{selectedAsset ? selectedAsset.name : "Select an asset"}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
      </TouchableOpacity>

      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 6, textTransform: "uppercase" }}>Start ({DATE_FORMAT}) *</Text>
      <TextInput
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface, marginBottom: 14 }}
        placeholder={dayjs().format(DATE_FORMAT)}
        placeholderTextColor={colors.textMuted}
        value={startAt}
        onChangeText={setStartAt}
      />

      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 6, textTransform: "uppercase" }}>End ({DATE_FORMAT}) *</Text>
      <TextInput
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface, marginBottom: 14 }}
        placeholder={dayjs().add(1, "hour").format(DATE_FORMAT)}
        placeholderTextColor={colors.textMuted}
        value={endAt}
        onChangeText={setEndAt}
      />

      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 6, textTransform: "uppercase" }}>Purpose</Text>
      <TextInput
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface, marginBottom: 14 }}
        placeholder="What's it needed for?"
        placeholderTextColor={colors.textMuted}
        value={purpose}
        onChangeText={setPurpose}
      />

      <TouchableOpacity
        style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 15, marginTop: spacing.md, opacity: canSubmit ? 1 : 0.6 }}
        disabled={!canSubmit || mutation.isPending}
        onPress={() => mutation.mutate()}
      >
        {mutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Create booking</Text>}
      </TouchableOpacity>

      <PickerModal
        visible={assetPickerOpen}
        title="Select asset"
        options={assetOptions}
        selectedId={assetId}
        searchable
        onSelect={(v) => setAssetId(v as number | null)}
        onClose={() => setAssetPickerOpen(false)}
      />
    </ScrollView>
    </KeyboardAvoidingScreen>
  );
}

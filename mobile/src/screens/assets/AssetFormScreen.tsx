import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { Asset, AssetCategory, AssetLocation, AssetStatus, AssetUserRef, ASSET_STATUS_OPTIONS } from "../../types/asset";
import { AssetsStackParamList } from "../../navigation/types";

type PickerKey = "category" | "location" | "assignedTo" | "status" | null;

export function AssetFormScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<AssetsStackParamList>>();
  const route = useRoute<RouteProp<AssetsStackParamList, "AssetForm">>();
  const editingId = route.params?.id;
  const queryClient = useQueryClient();

  const [assetTag, setAssetTag] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<AssetStatus>("IN_USE");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [assignedToId, setAssignedToId] = useState<number | null>(null);
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [openPicker, setOpenPicker] = useState<PickerKey>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: existing, isLoading: loadingExisting } = useQuery({
    queryKey: ["mobile-asset", editingId],
    queryFn: async () => (await axiosClient.get(`/assets/${editingId}`)).data as Asset,
    enabled: !!editingId,
  });

  const { data: categories } = useQuery({
    queryKey: ["mobile-asset-categories"],
    queryFn: async () => (await axiosClient.get("/asset-categories")).data as AssetCategory[],
  });
  const { data: locations } = useQuery({
    queryKey: ["mobile-locations"],
    queryFn: async () => (await axiosClient.get("/locations")).data as AssetLocation[],
  });
  const { data: users } = useQuery({
    queryKey: ["mobile-users-directory"],
    queryFn: async () => (await axiosClient.get("/users/directory")).data as AssetUserRef[],
  });

  useEffect(() => {
    if (!existing) return;
    setAssetTag(existing.assetTag);
    setName(existing.name);
    setStatus(existing.status);
    setCategoryId(existing.categoryId);
    setLocationId(existing.locationId);
    setAssignedToId(existing.assignedToId);
    setManufacturer(existing.manufacturer ?? "");
    setModel(existing.model ?? "");
    setSerialNumber(existing.serialNumber ?? "");
    setNotes(existing.notes ?? "");
  }, [existing]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        assetTag,
        name,
        status,
        categoryId,
        locationId,
        assignedToId,
        manufacturer: manufacturer || undefined,
        model: model || undefined,
        serialNumber: serialNumber || undefined,
        notes: notes || undefined,
      };
      if (editingId) return axiosClient.patch(`/assets/${editingId}`, payload);
      return axiosClient.post("/assets", payload);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["mobile-assets"] });
      queryClient.invalidateQueries({ queryKey: ["mobile-asset", editingId] });
      navigation.replace("AssetDetail", { id: editingId ?? res.data.id });
    },
    onError: (err: any) => setError(err?.response?.data?.error ?? "Failed to save asset."),
  });

  if (editingId && loadingExisting) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const categoryOptions: PickerOption[] = (categories ?? []).map((c) => ({ id: c.id, label: c.name }));
  const locationOptions: PickerOption[] = (locations ?? []).map((l) => ({ id: l.id, label: l.name }));
  const userOptions: PickerOption[] = (users ?? []).map((u) => ({ id: u.id, label: `${u.firstName} ${u.lastName}`, sublabel: u.email }));
  const statusOptions: PickerOption[] = ASSET_STATUS_OPTIONS.map((s) => ({ id: s.value, label: s.label }));

  const categoryLabel = categories?.find((c) => c.id === categoryId)?.name ?? "None";
  const locationLabel = locations?.find((l) => l.id === locationId)?.name ?? "None";
  const assignedLabel = users?.find((u) => u.id === assignedToId);
  const statusLabel = ASSET_STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      {error && (
        <View style={{ backgroundColor: colors.danger + "22", borderRadius: radius.md, padding: 12, marginBottom: spacing.md }}>
          <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text>
        </View>
      )}

      <Field label="Asset Tag *" colors={colors}>
        <TextInput style={fieldInputStyle(colors, radius)} placeholder="e.g. KYN-0001" placeholderTextColor={colors.textMuted} value={assetTag} onChangeText={setAssetTag} />
      </Field>

      <Field label="Name *" colors={colors}>
        <TextInput style={fieldInputStyle(colors, radius)} placeholder="e.g. Dell Latitude 5420" placeholderTextColor={colors.textMuted} value={name} onChangeText={setName} />
      </Field>

      <PickerField label="Status" value={statusLabel} colors={colors} radius={radius} onPress={() => setOpenPicker("status")} />
      <PickerField label="Category" value={categoryLabel} colors={colors} radius={radius} onPress={() => setOpenPicker("category")} />
      <PickerField label="Location" value={locationLabel} colors={colors} radius={radius} onPress={() => setOpenPicker("location")} />
      <PickerField
        label="Assigned to"
        value={assignedLabel ? `${assignedLabel.firstName} ${assignedLabel.lastName}` : "None"}
        colors={colors}
        radius={radius}
        onPress={() => setOpenPicker("assignedTo")}
      />

      <Field label="Manufacturer" colors={colors}>
        <TextInput style={fieldInputStyle(colors, radius)} placeholderTextColor={colors.textMuted} value={manufacturer} onChangeText={setManufacturer} />
      </Field>
      <Field label="Model" colors={colors}>
        <TextInput style={fieldInputStyle(colors, radius)} placeholderTextColor={colors.textMuted} value={model} onChangeText={setModel} />
      </Field>
      <Field label="Serial number" colors={colors}>
        <TextInput style={fieldInputStyle(colors, radius)} placeholderTextColor={colors.textMuted} value={serialNumber} onChangeText={setSerialNumber} />
      </Field>
      <Field label="Notes" colors={colors}>
        <TextInput
          style={[fieldInputStyle(colors, radius), { height: 90, textAlignVertical: "top" }]}
          multiline
          placeholderTextColor={colors.textMuted}
          value={notes}
          onChangeText={setNotes}
        />
      </Field>

      <TouchableOpacity
        style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 15, marginTop: spacing.lg }}
        disabled={!assetTag || !name || mutation.isPending}
        onPress={() => mutation.mutate()}
      >
        {mutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>{editingId ? "Save changes" : "Create asset"}</Text>}
      </TouchableOpacity>

      <PickerModal
        visible={openPicker === "status"}
        title="Status"
        options={statusOptions}
        selectedId={status}
        onSelect={(id) => setStatus(id as AssetStatus)}
        onClose={() => setOpenPicker(null)}
      />
      <PickerModal
        visible={openPicker === "category"}
        title="Category"
        options={categoryOptions}
        selectedId={categoryId}
        allowClear
        searchable
        onSelect={(id) => setCategoryId(id as number | null)}
        onClose={() => setOpenPicker(null)}
      />
      <PickerModal
        visible={openPicker === "location"}
        title="Location"
        options={locationOptions}
        selectedId={locationId}
        allowClear
        searchable
        onSelect={(id) => setLocationId(id as number | null)}
        onClose={() => setOpenPicker(null)}
      />
      <PickerModal
        visible={openPicker === "assignedTo"}
        title="Assigned to"
        options={userOptions}
        selectedId={assignedToId}
        allowClear
        searchable
        onSelect={(id) => setAssignedToId(id as number | null)}
        onClose={() => setOpenPicker(null)}
      />
    </ScrollView>
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
  return {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.surface,
  };
}

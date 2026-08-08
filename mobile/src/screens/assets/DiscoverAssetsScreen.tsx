import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { ShimmerList } from "../../components/Shimmer";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { AssetCategory } from "../../types/asset";

dayjs.extend(relativeTime);

interface DiscoveredDevice {
  id: number;
  hostname: string;
  macAddress: string;
  ipAddresses: string[];
  os: string | null;
  osVersion: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  loggedInUser: string | null;
  lastSeen: string;
}

function emptyForm(d: DiscoveredDevice) {
  return { assetTag: d.macAddress.replace(/:/g, "").toUpperCase(), name: d.hostname, categoryId: null as number | null, manufacturer: d.manufacturer ?? "", model: d.model ?? "", serialNumber: d.serialNumber ?? "" };
}

// Mirrors client/src/pages/assets/DiscoverDevicesModal.tsx — devices reported by the Kynren
// agent that aren't linked to an asset record yet. Register form is a small purpose-built inline
// form rather than the full AssetFormModal, same simplification already applied to IP Range
// Scanner's "Adopt into Inventory" flow.
export function DiscoverAssetsScreen() {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();
  const [registering, setRegistering] = useState<DiscoveredDevice | null>(null);
  const [form, setForm] = useState(emptyForm({ macAddress: "", hostname: "" } as DiscoveredDevice));
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["mobile-devices-unregistered"],
    queryFn: async () => (await axiosClient.get("/devices", { params: { unregistered: true, pageSize: 100 } })).data,
  });
  const { data: categories } = useQuery({ queryKey: ["mobile-asset-categories"], queryFn: async () => (await axiosClient.get("/asset-categories")).data as AssetCategory[] });

  const registerMutation = useMutation({
    mutationFn: () =>
      axiosClient.post("/assets", {
        assetTag: form.assetTag, name: form.name, categoryId: form.categoryId, manufacturer: form.manufacturer || undefined,
        model: form.model || undefined, serialNumber: form.serialNumber || undefined, deviceId: registering!.id,
        notes: registering!.loggedInUser ? `Discovered via network agent. Last logged-in user: ${registering!.loggedInUser}.` : "Discovered via network agent.",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-devices-unregistered"] });
      queryClient.invalidateQueries({ queryKey: ["mobile-assets"] });
      queryClient.invalidateQueries({ queryKey: ["mobile-asset-stats"] });
      setRegistering(null);
    },
  });

  const devices: DiscoveredDevice[] = data?.items ?? [];
  const categoryOptions: PickerOption[] = (categories ?? []).map((c) => ({ id: c.id, label: c.name }));
  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.bg };

  if (isLoading) return <ShimmerList />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={devices}
        keyExtractor={(d) => String(d.id)}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
        ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 40 }}>No unregistered devices found. Every reporting agent is already linked to an asset.</Text>}
        renderItem={({ item: d }) => (
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{d.hostname}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 4 }}>
              {d.ipAddresses?.[0] ?? "No IP"} · {d.macAddress}{d.os ? ` · ${d.os}${d.osVersion ? " " + d.osVersion : ""}` : ""}
            </Text>
            {d.loggedInUser && <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 2 }}>Logged in: {d.loggedInUser}</Text>}
            <Text style={{ color: colors.textMuted, fontSize: 10.5, marginTop: 2 }}>Last scanned {dayjs(d.lastSeen).fromNow()}</Text>
            <TouchableOpacity style={{ marginTop: 10, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 8 }} onPress={() => { setForm(emptyForm(d)); setRegistering(d); }}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Register as Asset</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      {registering && (
        <View style={{ position: "absolute", inset: 0, backgroundColor: "#0008", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, maxHeight: "85%" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>Register "{registering.hostname}"</Text>
              <TouchableOpacity onPress={() => setRegistering(null)}><Ionicons name="close" size={22} color={colors.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ gap: 10 }}>
              <TextInput style={inputStyle} placeholder="Asset Tag *" placeholderTextColor={colors.textMuted} value={form.assetTag} onChangeText={(v) => setForm((f) => ({ ...f, assetTag: v }))} autoCapitalize="characters" />
              <TextInput style={inputStyle} placeholder="Name *" placeholderTextColor={colors.textMuted} value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} />
              <TouchableOpacity style={inputStyle} onPress={() => setCategoryPickerOpen(true)}>
                <Text style={{ color: form.categoryId ? colors.text : colors.textMuted, fontSize: 14 }}>{categoryOptions.find((o) => o.id === form.categoryId)?.label ?? "Category"}</Text>
              </TouchableOpacity>
              <TextInput style={inputStyle} placeholder="Manufacturer" placeholderTextColor={colors.textMuted} value={form.manufacturer} onChangeText={(v) => setForm((f) => ({ ...f, manufacturer: v }))} />
              <TextInput style={inputStyle} placeholder="Model" placeholderTextColor={colors.textMuted} value={form.model} onChangeText={(v) => setForm((f) => ({ ...f, model: v }))} />
              <TextInput style={inputStyle} placeholder="Serial Number" placeholderTextColor={colors.textMuted} value={form.serialNumber} onChangeText={(v) => setForm((f) => ({ ...f, serialNumber: v }))} />
            </ScrollView>
            <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, marginTop: spacing.md, opacity: form.assetTag.trim() && form.name.trim() ? 1 : 0.5 }} disabled={!form.assetTag.trim() || !form.name.trim() || registerMutation.isPending} onPress={() => registerMutation.mutate()}>
              {registerMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Register</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <PickerModal visible={categoryPickerOpen} title="Category" options={categoryOptions} selectedId={form.categoryId} allowClear onSelect={(id) => setForm((f) => ({ ...f, categoryId: id as number | null }))} onClose={() => setCategoryPickerOpen(false)} />
    </View>
  );
}

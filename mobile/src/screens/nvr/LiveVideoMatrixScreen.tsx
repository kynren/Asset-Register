import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { NvrMatrixTile } from "./NvrMatrixTile";
import { Camera, Nvr } from "../../types/nvr";

const MAX_TILES = 4;

// Mobile port of client/src/pages/nvr/LiveVideoMatrixTab.tsx — up to 4 simultaneous HLS live
// feeds in a grid (capped below the web version's larger custom grid sizes since a phone screen
// can't usefully render more tiles than that). No drag-and-drop reordering — tap to add/remove.
export function LiveVideoMatrixScreen() {
  const { colors, spacing, radius } = useTheme();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: nvrs, isLoading } = useQuery({
    queryKey: ["mobile-nvrs"],
    queryFn: async () => (await axiosClient.get("/nvr")).data as Nvr[],
  });

  const allCameras = useMemo(() => (nvrs ?? []).flatMap((n) => n.cameras.map((c) => ({ ...c, nvrName: n.name }))), [nvrs]);
  const selectedCameras = selectedIds.map((id) => allCameras.find((c) => c.id === id)).filter((c): c is Camera & { nvrName: string } => !!c);

  const options: PickerOption[] = allCameras
    .filter((c) => !!c.streamUrl && !selectedIds.includes(c.id))
    .map((c) => ({ id: c.id, label: c.name, sublabel: `${c.nvrName}${c.location ? ` · ${c.location.name}` : ""}` }));

  function addCamera(id: number | string | null) {
    if (id == null) return;
    setSelectedIds((prev) => (prev.length >= MAX_TILES ? prev : [...prev, Number(id)]));
  }

  if (isLoading) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: colors.textMuted, fontSize: 11.5, flex: 1, marginRight: spacing.sm }}>{selectedCameras.length} / {MAX_TILES} live feeds</Text>
        <TouchableOpacity
          style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: selectedCameras.length >= MAX_TILES ? colors.surface : colors.primary, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, opacity: selectedCameras.length >= MAX_TILES ? 0.6 : 1 }}
          disabled={selectedCameras.length >= MAX_TILES}
          onPress={() => setPickerOpen(true)}
        >
          <Ionicons name="add" size={15} color={selectedCameras.length >= MAX_TILES ? colors.textMuted : "#fff"} />
          <Text style={{ color: selectedCameras.length >= MAX_TILES ? colors.textMuted : "#fff", fontWeight: "700", fontSize: 12 }}>Add Camera</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0 }}>
        {selectedCameras.length === 0 ? (
          <View style={{ alignItems: "center", marginTop: 40 }}>
            <Ionicons name="grid-outline" size={32} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 10, textAlign: "center" }}>Add up to {MAX_TILES} cameras to view live at once.</Text>
          </View>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {selectedCameras.map((c) => (
              <View key={c.id} style={{ width: "48%" }}>
                <NvrMatrixTile camera={c} onRemove={() => setSelectedIds((prev) => prev.filter((id) => id !== c.id))} />
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <PickerModal visible={pickerOpen} title="Add Camera" options={options} searchable onSelect={addCamera} onClose={() => setPickerOpen(false)} />
    </View>
  );
}

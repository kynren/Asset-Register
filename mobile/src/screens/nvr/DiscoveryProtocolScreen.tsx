import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { ShimmerList } from "../../components/Shimmer";
import { PickerModal, PickerOption } from "../../components/PickerModal";

interface Nvr { id: number; name: string; ipAddress: string | null; protocol: string | null }
interface DiscoveredChannel { name: string; channelNumber?: number; channel?: number; streamUri: string | null }

// Mirrors client/src/pages/nvr/DiscoveryProtocolTab.tsx — runs the same ONVIF/ISAPI channel
// discovery the Add/Edit NVR form uses, against an already-saved NVR's stored credentials.
export function DiscoveryProtocolScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [nvrId, setNvrId] = useState<number | null>(null);
  const [nvrPickerOpen, setNvrPickerOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const { data: nvrs, isLoading } = useQuery({ queryKey: ["mobile-nvrs-discovery"], queryFn: async () => (await axiosClient.get("/nvr")).data as Nvr[] });
  const selectedNvr = nvrs?.find((n) => n.id === nvrId);

  const discoverMutation = useMutation({
    mutationFn: async () => (await axiosClient.post(`/nvr/${nvrId}/discover-channels`)).data as { channels: DiscoveredChannel[]; message?: string; protocol?: string },
    onSuccess: () => setSelected(new Set()),
  });

  const importMutation = useMutation({
    mutationFn: (channels: DiscoveredChannel[]) =>
      axiosClient.post(`/nvr/${nvrId}/import-cameras`, { channels: channels.map((ch) => ({ name: ch.name, streamUri: ch.streamUri, channel: ch.channelNumber ?? ch.channel ?? null })) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["mobile-nvrs-discovery"] }); discoverMutation.reset(); setSelected(new Set()); },
  });

  const channels = discoverMutation.data?.channels ?? [];
  const message = discoverMutation.data?.message;
  const protocolUsed = discoverMutation.data?.protocol;

  function toggle(i: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  const nvrOptions: PickerOption[] = (nvrs ?? []).map((n) => ({ id: n.id, label: n.name, sublabel: `${n.ipAddress ?? "no IP set"} (${n.protocol ?? "RTSP"})` }));

  if (isLoading) return <ShimmerList />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>Discover the real camera channels an NVR/DVR manages via ONVIF or Hikvision ISAPI, then import them as cameras.</Text>

        <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surface }} onPress={() => setNvrPickerOpen(true)}>
          <Text style={{ color: nvrId ? colors.text : colors.textMuted, fontSize: 14 }}>{nvrOptions.find((o) => o.id === nvrId)?.label ?? "Select an NVR to scan..."}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, opacity: nvrId && selectedNvr?.ipAddress ? 1 : 0.5 }}
          disabled={!nvrId || !selectedNvr?.ipAddress || discoverMutation.isPending}
          onPress={() => discoverMutation.mutate()}
        >
          {discoverMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Run Discovery</Text>}
        </TouchableOpacity>

        {message && (
          <View style={{ backgroundColor: (channels.length > 0 ? colors.success : colors.warning) + "1a", borderRadius: radius.sm, padding: 10 }}>
            <Text style={{ color: channels.length > 0 ? colors.success : colors.warning, fontSize: 12 }}>{protocolUsed ? `[${protocolUsed}] ` : ""}{message}</Text>
          </View>
        )}

        {importMutation.isSuccess && (
          <View style={{ backgroundColor: colors.success + "1a", borderRadius: radius.sm, padding: 10 }}>
            <Text style={{ color: colors.success, fontSize: 12 }}>Cameras imported — check Cameras or the Live Video Matrix.</Text>
          </View>
        )}
      </View>

      {channels.length > 0 && (
        <FlatList
          data={channels}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 6 }}
          renderItem={({ item: ch, index: i }) => (
            <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm }} onPress={() => toggle(i)}>
              <Ionicons name={selected.has(i) ? "checkbox" : "square-outline"} size={20} color={selected.has(i) ? colors.primary : colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{(ch.channelNumber ?? ch.channel) != null ? `Ch. ${ch.channelNumber ?? ch.channel} — ` : ""}{ch.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{ch.streamUri ?? "No stream URI reported"}</Text>
              </View>
            </TouchableOpacity>
          )}
          ListFooterComponent={
            hasPermission("nvr", "create") ? (
              <TouchableOpacity
                style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, marginTop: spacing.sm, opacity: selected.size > 0 ? 1 : 0.5 }}
                disabled={selected.size === 0 || importMutation.isPending}
                onPress={() => importMutation.mutate(channels.filter((_, i) => selected.has(i)))}
              >
                {importMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Import {selected.size || ""} Selected</Text>}
              </TouchableOpacity>
            ) : null
          }
        />
      )}

      {!isLoading && (nvrs ?? []).length === 0 && <Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 20 }}>No NVRs registered yet — add one under Cameras first.</Text>}

      <PickerModal visible={nvrPickerOpen} title="NVR / DVR" options={nvrOptions} selectedId={nvrId} onSelect={(id) => { setNvrId(id as number | null); discoverMutation.reset(); }} onClose={() => setNvrPickerOpen(false)} />
    </View>
  );
}

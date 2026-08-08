import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute, RouteProp } from "@react-navigation/native";
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useAuth } from "../../auth/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { ShimmerList } from "../../components/Shimmer";
import { Asset } from "../../types/asset";
import { AssetsStackParamList } from "../../navigation/types";

interface FieldConfig { key: string; label: string; required?: boolean; type?: "text" | "number"; placeholder?: string }
type ResourceKind = "components" | "volumes" | "connections" | "network-ports" | "sockets";

const CONFIG: Record<ResourceKind, { title: string; subtitle: string; addLabel: string; primary: string; fields: FieldConfig[] }> = {
  components: {
    title: "Components", subtitle: "Hardware components installed in this asset (CPU, RAM, GPU, motherboard, etc.).", addLabel: "Add Component", primary: "name",
    fields: [{ key: "type", label: "Type", required: true, placeholder: "e.g. CPU" }, { key: "name", label: "Name", required: true, placeholder: "e.g. Intel i7-1355U" }, { key: "details", label: "Details", placeholder: "Optional notes" }],
  },
  volumes: {
    title: "Volumes", subtitle: "Disk volumes and storage partitions tracked for this asset.", addLabel: "Add Volume", primary: "label",
    fields: [{ key: "label", label: "Label", required: true, placeholder: "e.g. C:\\" }, { key: "totalGb", label: "Total (GB)", type: "number", placeholder: "512" }, { key: "freeGb", label: "Free (GB)", type: "number", placeholder: "128" }, { key: "fileSystem", label: "File System", placeholder: "NTFS" }],
  },
  connections: {
    title: "Connections", subtitle: "Cables, peripherals, and network connections attached to this asset.", addLabel: "Add Connection", primary: "label",
    fields: [{ key: "label", label: "Label", required: true, placeholder: "e.g. Uplink" }, { key: "type", label: "Type", placeholder: "Ethernet / Wi-Fi / USB" }, { key: "target", label: "Connected To", placeholder: "e.g. Switch Port 4" }],
  },
  "network-ports": {
    title: "Network Ports", subtitle: "Logical network ports/services exposed by this asset.", addLabel: "Add Port", primary: "portNumber",
    fields: [{ key: "portNumber", label: "Port", required: true, type: "number", placeholder: "443" }, { key: "protocol", label: "Protocol", placeholder: "TCP / UDP" }, { key: "serviceName", label: "Service", placeholder: "HTTPS" }, { key: "status", label: "Status", placeholder: "Open / Closed" }],
  },
  sockets: {
    title: "Sockets", subtitle: "Physical power, network, or USB sockets used by this asset.", addLabel: "Add Socket", primary: "label",
    fields: [{ key: "label", label: "Label", required: true, placeholder: "e.g. Rack A - Socket 3" }, { key: "type", label: "Type", placeholder: "Power / Network / USB" }, { key: "location", label: "Location", placeholder: "e.g. Server Room" }],
  },
};

// Parses the same format the agent writes in agent/kynren_agent.py get_disk_info():
// "C:\\ 512.0GB total, 200.0GB free; D:\\ 1024.0GB total, 400.0GB free"
function parseDiskInfo(diskInfo: string | null | undefined) {
  if (!diskInfo) return [];
  return diskInfo.split(";").map((p) => p.trim()).filter(Boolean).map((part) => {
    const m = part.match(/^(.+?)\s+([\d.]+)GB total,\s*([\d.]+)GB free$/i);
    return m ? { label: m[1], totalGb: m[2], freeGb: m[3], fileSystem: "—" } : { label: part, totalGb: "—", freeGb: "—", fileSystem: "—" };
  });
}

// Generic mirror of client/src/pages/assets/detail/SubResourceTab.tsx, parameterized by resource
// kind — used for Components/Volumes/Connections/Network Ports/Sockets.
export function AssetSubResourceScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const route = useRoute<RouteProp<AssetsStackParamList, "AssetSubResource">>();
  const { assetId, kind } = route.params;
  const cfg = CONFIG[kind as ResourceKind];
  const canEdit = hasPermission("assets", "edit");
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});

  const { data: items, isLoading } = useQuery({
    queryKey: ["mobile-asset-resource", assetId, kind],
    queryFn: async () => (await axiosClient.get(`/asset-resources/${assetId}/${kind}`)).data as Record<string, any>[],
  });
  const { data: asset } = useQuery({ queryKey: ["mobile-asset", assetId], queryFn: async () => (await axiosClient.get(`/assets/${assetId}`)).data as Asset });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => axiosClient.post(`/asset-resources/${assetId}/${kind}`, payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["mobile-asset-resource", assetId, kind] }); setValues({}); },
  });
  const deleteMutation = useMutation({
    mutationFn: (itemId: number) => axiosClient.delete(`/asset-resources/${assetId}/${kind}/${itemId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-asset-resource", assetId, kind] }),
  });

  function confirmDelete(item: Record<string, any>) {
    Alert.alert(`Delete ${cfg.title.replace(/s$/, "")}`, `Delete "${item[cfg.primary] ?? "this item"}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(item.id) },
    ]);
  }

  function handleSubmit() {
    const payload: Record<string, unknown> = {};
    for (const f of cfg.fields) {
      const raw = values[f.key];
      if (raw === undefined || raw === "") continue;
      payload[f.key] = f.type === "number" ? Number(raw) : raw;
    }
    createMutation.mutate(payload);
  }

  const canSubmit = cfg.fields.filter((f) => f.required).every((f) => values[f.key]);
  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.bg };

  const agentRows =
    kind === "volumes" ? parseDiskInfo(asset?.device?.diskInfo) :
    kind === "connections" && asset?.device ? [
      ...asset.device.ipAddresses.map((ip, i) => ({ label: i === 0 ? "Primary Network Adapter" : `Network Adapter ${i + 1}`, type: "Network", target: ip })),
      { label: "MAC Address", type: "Physical", target: asset.device.macAddress },
    ] : [];

  if (isLoading) return <ShimmerList />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>{cfg.subtitle}</Text>

      {agentRows.length > 0 && (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <View style={{ backgroundColor: colors.success + "22", borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ color: colors.success, fontSize: 10, fontWeight: "700" }}>LIVE</Text>
            </View>
            <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "700" }}>Reported by the Kynren agent</Text>
          </View>
          {agentRows.map((row: any, i) => (
            <Text key={i} style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
              {cfg.fields.map((f) => row[f.key]).filter(Boolean).join(" · ")}
            </Text>
          ))}
        </View>
      )}

      {canEdit && (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 10 }}>
          {cfg.fields.map((f) => (
            <TextInput
              key={f.key}
              style={inputStyle}
              placeholder={`${f.label}${f.required ? " *" : ""}`}
              placeholderTextColor={colors.textMuted}
              value={values[f.key] ?? ""}
              onChangeText={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
              keyboardType={f.type === "number" ? "numeric" : "default"}
            />
          ))}
          <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, opacity: canSubmit ? 1 : 0.5 }} disabled={!canSubmit || createMutation.isPending} onPress={handleSubmit}>
            {createMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{cfg.addLabel}</Text>}
          </TouchableOpacity>
        </View>
      )}

      {(items ?? []).length === 0 ? (
        <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: "center" }}>No {cfg.title.toLowerCase()} recorded for this asset yet.</Text>
      ) : (
        (items ?? []).map((item) => (
          <View key={item.id} style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{item[cfg.primary] ?? "—"}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                {cfg.fields.filter((f) => f.key !== cfg.primary && item[f.key]).map((f) => `${f.label}: ${item[f.key]}`).join(" · ")}
              </Text>
            </View>
            {canEdit && (
              <TouchableOpacity onPress={() => confirmDelete(item)}><Ionicons name="trash-outline" size={18} color={colors.danger} /></TouchableOpacity>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}

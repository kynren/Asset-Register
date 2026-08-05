import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute, RouteProp } from "@react-navigation/native";
import { ActivityIndicator, Image, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { API_ORIGIN } from "../../config/env";
import { MoreStackParamList } from "../../navigation/types";

interface Placement {
  id: number;
  deviceId: number;
  x: number;
  y: number;
  onColor: string | null;
  offColor: string | null;
  device: { id: number; name: string; isOn: boolean | null; status: "ONLINE" | "OFFLINE" | "UNKNOWN"; icon: string | null };
}
interface SiteMapDetail {
  id: number;
  name: string;
  imageUrl: string;
  devices: Placement[];
}

// Read-only companion to LightingSiteMapListScreen — markers are positioned with the same 0-100
// percent-of-image-width/height coordinate space the web SiteMapEditor writes (see
// server/src/modules/lighting/siteMap.routes.ts placementSelect), so no client-side scaling math
// is needed beyond plain percentage layout strings.
export function LightingSiteMapViewScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const route = useRoute<RouteProp<MoreStackParamList, "LightingSiteMapView">>();
  const [selected, setSelected] = useState<Placement | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["mobile-lighting-site-map", route.params.id],
    queryFn: async () => (await axiosClient.get(`/lighting/site-maps/${route.params.id}`)).data as SiteMapDetail,
    refetchInterval: 15_000,
  });

  const powerMutation = useMutation({
    mutationFn: ({ deviceId, on }: { deviceId: number; on: boolean }) => axiosClient.post(`/lighting/devices/${deviceId}/power`, { on }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-lighting-site-map", route.params.id] }),
  });

  const canEdit = hasPermission("lighting", "edit");

  if (isLoading || !data) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;

  const activeDevice = selected ? data.devices.find((d) => d.id === selected.id)?.device ?? selected.device : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ margin: spacing.lg, borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: colors.border, aspectRatio: 4 / 3, backgroundColor: "#111" }}>
        <Image source={{ uri: `${API_ORIGIN}${data.imageUrl}` }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
        {data.devices.map((p) => {
          const isOn = !!p.device.isOn;
          const offline = p.device.status !== "ONLINE";
          const color = offline ? "#667085" : isOn ? p.onColor ?? "#22c55e" : p.offColor ?? "#475569";
          return (
            <TouchableOpacity
              key={p.id}
              style={{
                position: "absolute",
                left: `${p.x}%` as any,
                top: `${p.y}%` as any,
                width: 26,
                height: 26,
                marginLeft: -13,
                marginTop: -13,
                borderRadius: 13,
                backgroundColor: color,
                borderWidth: 2,
                borderColor: "#fff",
                alignItems: "center",
                justifyContent: "center",
              }}
              onPress={() => setSelected(p)}
            >
              <Ionicons name="bulb" size={13} color="#fff" />
            </TouchableOpacity>
          );
        })}
      </View>

      {data.devices.length === 0 && (
        <Text style={{ color: colors.textMuted, fontSize: 12.5, textAlign: "center", marginTop: spacing.sm }}>No devices placed on this map yet.</Text>
      )}

      {activeDevice && (
        <View style={{ marginHorizontal: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, flexDirection: "row", alignItems: "center" }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: activeDevice.status === "ONLINE" ? colors.success : colors.danger, marginRight: 10 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{activeDevice.name}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 2 }}>{activeDevice.status === "ONLINE" ? (activeDevice.isOn ? "On" : "Off") : "Offline"}</Text>
          </View>
          {canEdit && activeDevice.status === "ONLINE" && (
            <TouchableOpacity
              style={{ backgroundColor: activeDevice.isOn ? colors.danger : colors.primary, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 9 }}
              disabled={powerMutation.isPending}
              onPress={() => powerMutation.mutate({ deviceId: activeDevice.id, on: !activeDevice.isOn })}
            >
              {powerMutation.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>{activeDevice.isOn ? "Turn Off" : "Turn On"}</Text>}
            </TouchableOpacity>
          )}
          <TouchableOpacity style={{ marginLeft: 10 }} onPress={() => setSelected(null)}>
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

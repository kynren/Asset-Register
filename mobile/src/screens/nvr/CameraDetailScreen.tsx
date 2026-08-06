import { useLayoutEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useAuth } from "../../auth/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { ShimmerDetail } from "../../components/Shimmer";
import { CameraEvent, Nvr } from "../../types/nvr";
import { MoreStackParamList } from "../../navigation/types";

export function CameraDetailScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const route = useRoute<RouteProp<MoreStackParamList, "CameraDetail">>();
  const { id } = route.params;
  const queryClient = useQueryClient();

  const { data: nvrs, isLoading } = useQuery({
    queryKey: ["mobile-nvrs"],
    queryFn: async () => (await axiosClient.get("/nvr")).data as Nvr[],
  });

  const found = useMemo(() => {
    for (const nvr of nvrs ?? []) {
      const camera = nvr.cameras.find((c) => c.id === id);
      if (camera) return { camera, nvr };
    }
    return null;
  }, [nvrs, id]);

  const { data: events } = useQuery({
    queryKey: ["mobile-camera-events", id],
    queryFn: async () => (await axiosClient.get("/nvr/events", { params: { cameraId: id } })).data as CameraEvent[],
  });

  const checkStatusMutation = useMutation({
    mutationFn: () => axiosClient.post(`/nvr/cameras/${id}/check-status`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-nvrs"] });
      queryClient.invalidateQueries({ queryKey: ["mobile-camera-events", id] });
    },
  });

  useLayoutEffect(() => {
    navigation.setOptions({ title: found?.camera.name ?? "Camera" });
  }, [navigation, found]);

  if (isLoading || !found) {
    return <ShimmerDetail />;
  }

  const { camera, nvr } = found;
  const canEdit = hasPermission("nvr", "edit");
  const tone = camera.status === "ONLINE" ? colors.success : camera.status === "OFFLINE" ? colors.danger : colors.textMuted;

  const rows: [string, string | null][] = [
    ["NVR", nvr.name],
    ["Location", camera.location?.name ?? null],
    ["IP address", camera.ipAddress],
    ["Channel", camera.channel != null ? String(camera.channel) : null],
    ["PTZ", camera.ptzEnabled ? "Enabled" : "Disabled"],
    ["Latency", camera.lastConnectionLatencyMs != null ? `${camera.lastConnectionLatencyMs} ms` : null],
    ["Last checked", camera.lastCheckedAt ? dayjs(camera.lastCheckedAt).format("DD MMM YYYY HH:mm") : null],
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={{ alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.lg }}>
        <Ionicons name="videocam" size={28} color={tone} />
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: "800", marginTop: 8 }}>{camera.name}</Text>
        <Text style={{ color: tone, fontSize: 12, fontWeight: "700", marginTop: 4 }}>{camera.status}</Text>
      </View>

      <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg }}>
        {!!camera.streamUrl && (
          <TouchableOpacity
            style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 13 }}
            onPress={() => navigation.navigate("LiveCamera", { id: camera.id })}
          >
            <Ionicons name="play-circle-outline" size={16} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "700" }}>Watch Live</Text>
          </TouchableOpacity>
        )}
        {canEdit && (
          <TouchableOpacity
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radius.md,
              paddingVertical: 13,
              paddingHorizontal: camera.streamUrl ? 16 : undefined,
              flex: camera.streamUrl ? undefined : 1,
              opacity: checkStatusMutation.isPending ? 0.7 : 1,
            }}
            onPress={() => checkStatusMutation.mutate()}
            disabled={checkStatusMutation.isPending}
          >
            {checkStatusMutation.isPending ? <ActivityIndicator color={colors.text} size="small" /> : <Ionicons name="refresh" size={16} color={colors.text} />}
            <Text style={{ color: colors.text, fontWeight: "700" }}>Check status</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, marginBottom: spacing.lg }}>
        {rows
          .filter(([, v]) => v !== null)
          .map(([label, value], i, arr) => (
            <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{label}</Text>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{value}</Text>
            </View>
          ))}
      </View>

      {!!events?.length && (
        <View>
          <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", marginBottom: 8 }}>Recent events</Text>
          {events.slice(0, 15).map((e) => (
            <View key={e.id} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ color: colors.text, fontSize: 13, flex: 1, marginRight: 8 }}>{e.message}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>{dayjs(e.createdAt).format("DD MMM HH:mm")}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

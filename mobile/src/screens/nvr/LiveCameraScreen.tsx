import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute, RouteProp } from "@react-navigation/native";
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { VideoView, useVideoPlayer } from "expo-video";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { useHlsStream } from "../../lib/useHlsStream";
import { Nvr } from "../../types/nvr";
import { MoreStackParamList } from "../../navigation/types";

interface PtzPreset {
  token: string;
  name: string;
}

// Mobile port of client/src/pages/nvr/LiveFeedPreview.tsx + PtzControlModal.tsx combined onto one
// screen — single-camera HLS live view (see useHlsStream.ts for why no hls.js is needed here)
// with an ONVIF PTZ pad underneath when the camera supports it.
export function LiveCameraScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const route = useRoute<RouteProp<MoreStackParamList, "LiveCamera">>();
  const queryClient = useQueryClient();
  const { id } = route.params;

  const { data: nvrs } = useQuery({
    queryKey: ["mobile-nvrs"],
    queryFn: async () => (await axiosClient.get("/nvr")).data as Nvr[],
  });
  const camera = useMemo(() => {
    for (const nvr of nvrs ?? []) {
      const cam = nvr.cameras.find((c) => c.id === id);
      if (cam) return cam;
    }
    return null;
  }, [nvrs, id]);

  const player = useVideoPlayer(null, (p) => {
    p.muted = true;
    p.loop = false;
  });
  const { status, error, start, stop } = useHlsStream(player, camera?.streamUrl ?? null, id);

  const ptzMutation = useMutation({
    mutationFn: (command: string) => axiosClient.post(`/nvr/cameras/${id}/ptz`, { command }),
  });
  const { data: presetsResult } = useQuery({
    queryKey: ["mobile-ptz-presets", id],
    queryFn: async () => (await axiosClient.get(`/nvr/cameras/${id}/ptz/presets`)).data as { ok: boolean; presets: PtzPreset[]; message: string },
    enabled: !!camera?.ptzEnabled,
    retry: false,
  });
  const gotoPresetMutation = useMutation({
    mutationFn: (presetToken: string) => axiosClient.post(`/nvr/cameras/${id}/ptz/goto-preset`, { presetToken }),
  });

  const recordMutation = useMutation({
    mutationFn: (action: "start" | "stop") => axiosClient.post(`/nvr/cameras/${id}/recordings/${action}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-camera-recordings", id] }),
    onError: (err: any) => Alert.alert("Recording", err?.response?.data?.error ?? "Could not change recording state."),
  });
  const { data: recordingInfo } = useQuery({
    queryKey: ["mobile-camera-recordings", id],
    queryFn: async () => (await axiosClient.get(`/nvr/cameras/${id}/recordings`)).data as { active: { recordingId: number } | null },
    refetchInterval: 8000,
  });

  const canEdit = hasPermission("nvr", "edit");
  const isBusy = status === "starting" || status === "ready" || status === "reconnecting";
  const isLive = status === "ready";
  const isRecording = !!recordingInfo?.active;

  if (!camera) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const ptzBtnStyle = { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center" as const, justifyContent: "center" as const };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ margin: spacing.lg, marginBottom: spacing.sm, borderRadius: radius.md, overflow: "hidden", backgroundColor: "#000", aspectRatio: 16 / 9 }}>
        {isLive ? (
          <VideoView player={player} style={{ width: "100%", height: "100%" }} contentFit="contain" nativeControls={false} />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg }}>
            {status === "starting" || status === "reconnecting" ? <ActivityIndicator color="#fff" /> : <Ionicons name="videocam-off-outline" size={30} color="#7b8497" />}
            <Text style={{ color: "#7b8497", fontSize: 12, marginTop: 10, textAlign: "center" }}>
              {status === "idle" && "No live preview started."}
              {status === "starting" && "Waiting for first video segment..."}
              {status === "reconnecting" && (error ?? "Reconnecting to live feed...")}
              {status === "failed" && (error ?? "Live feed unavailable.")}
            </Text>
          </View>
        )}
        {isRecording && (
          <View style={{ position: "absolute", top: 10, left: 10, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#0008", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.danger }} />
            <Text style={{ color: "#fff", fontSize: 10.5, fontWeight: "700" }}>REC</Text>
          </View>
        )}
      </View>

      <View style={{ flexDirection: "row", gap: spacing.sm, marginHorizontal: spacing.lg }}>
        <TouchableOpacity
          style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: isBusy ? colors.surface : colors.primary, borderWidth: isBusy ? 1 : 0, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 11 }}
          onPress={isBusy ? stop : start}
        >
          <Ionicons name={isBusy ? "stop-circle-outline" : "play-circle-outline"} size={17} color={isBusy ? colors.text : "#fff"} />
          <Text style={{ color: isBusy ? colors.text : "#fff", fontWeight: "700", fontSize: 12.5 }}>{isBusy ? (status === "starting" ? "Cancel" : "Stop Preview") : "Connect & Preview"}</Text>
        </TouchableOpacity>
        {canEdit && (
          <TouchableOpacity
            style={{ width: 46, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: isRecording ? colors.danger : colors.border }}
            disabled={recordMutation.isPending}
            onPress={() => recordMutation.mutate(isRecording ? "stop" : "start")}
          >
            {recordMutation.isPending ? <ActivityIndicator size="small" color={colors.text} /> : <Ionicons name={isRecording ? "square" : "radio-button-on"} size={17} color={isRecording ? colors.danger : colors.text} />}
          </TouchableOpacity>
        )}
      </View>

      {camera.ptzEnabled && canEdit && (
        <View style={{ margin: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, alignItems: "center" }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", alignSelf: "flex-start", marginBottom: spacing.md }}>PTZ Control</Text>
          <View style={{ width: 160 }}>
            <View style={{ flexDirection: "row", justifyContent: "center" }}>
              <TouchableOpacity style={ptzBtnStyle} onPress={() => ptzMutation.mutate("UP")}><Ionicons name="chevron-up" size={20} color={colors.text} /></TouchableOpacity>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginVertical: 6 }}>
              <TouchableOpacity style={ptzBtnStyle} onPress={() => ptzMutation.mutate("LEFT")}><Ionicons name="chevron-back" size={20} color={colors.text} /></TouchableOpacity>
              <TouchableOpacity style={ptzBtnStyle} onPress={() => ptzMutation.mutate("HOME")}><Ionicons name="home-outline" size={18} color={colors.text} /></TouchableOpacity>
              <TouchableOpacity style={ptzBtnStyle} onPress={() => ptzMutation.mutate("RIGHT")}><Ionicons name="chevron-forward" size={20} color={colors.text} /></TouchableOpacity>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "center" }}>
              <TouchableOpacity style={ptzBtnStyle} onPress={() => ptzMutation.mutate("DOWN")}><Ionicons name="chevron-down" size={20} color={colors.text} /></TouchableOpacity>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
            <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 }} onPress={() => ptzMutation.mutate("ZOOM_IN")}>
              <Ionicons name="add" size={14} color={colors.text} /><Text style={{ color: colors.text, fontSize: 12 }}>Zoom In</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 }} onPress={() => ptzMutation.mutate("ZOOM_OUT")}>
              <Ionicons name="remove" size={14} color={colors.text} /><Text style={{ color: colors.text, fontSize: 12 }}>Zoom Out</Text>
            </TouchableOpacity>
          </View>

          {!!presetsResult?.presets.length && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.md, justifyContent: "center" }}>
              {presetsResult.presets.map((p) => (
                <TouchableOpacity key={p.token} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} disabled={gotoPresetMutation.isPending} onPress={() => gotoPresetMutation.mutate(p.token)}>
                  <Text style={{ color: colors.text, fontSize: 11.5 }}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {(ptzMutation.data || ptzMutation.error) && (
            <Text style={{ color: ptzMutation.isError ? colors.danger : colors.success, fontSize: 11, marginTop: spacing.sm, textAlign: "center" }}>
              {ptzMutation.isError ? ((ptzMutation.error as any)?.response?.data?.error ?? "PTZ command failed.") : (ptzMutation.data as any)?.data?.message}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

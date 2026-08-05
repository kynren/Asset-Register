import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, FlatList, Modal, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { VideoView, useVideoPlayer } from "expo-video";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { getAccessToken } from "../../api/tokenStore";
import { API_ORIGIN } from "../../config/env";

interface Recording {
  id: number;
  cameraId: number;
  startedAt: string;
  endedAt: string | null;
  durationSec: number | null;
  trigger: string;
  filePath: string;
  camera: { id: number; name: string; nvr: { id: number; name: string } };
}

function formatDuration(sec: number | null): string {
  if (sec === null) return "In progress";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

// Mobile port of client/src/pages/nvr/NvrPlaybackCenterTab.tsx — recordings are plain mp4 files on
// disk (see server's recording.ts), so playback here just points expo-video's native player at the
// existing /nvr/recordings/:id/download endpoint with the bearer token as a header, same pattern
// as the live HLS feeds in useHlsStream.ts.
export function PlaybackCenterScreen() {
  const { colors, spacing, radius } = useTheme();
  const [playing, setPlaying] = useState<Recording | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["mobile-nvr-recordings"],
    queryFn: async () => (await axiosClient.get("/nvr/recordings")).data as Recording[],
  });

  if (isLoading) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={data ?? []}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 24 }}>No recordings yet.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}
            onPress={() => setPlaying(item)}
          >
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary + "22", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
              <Ionicons name="play" size={16} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "700" }}>{item.camera.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 2 }}>
                {item.camera.nvr.name} · {dayjs(item.startedAt).format("DD MMM YYYY HH:mm")}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                {formatDuration(item.durationSec)} · {item.trigger}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      />

      <Modal visible={!!playing} animationType="slide" onRequestClose={() => setPlaying(null)}>
        {playing && <RecordingPlayer recording={playing} onClose={() => setPlaying(null)} />}
      </Modal>
    </View>
  );
}

function RecordingPlayer({ recording, onClose }: { recording: Recording; onClose: () => void }) {
  const { colors, spacing } = useTheme();
  const token = getAccessToken();
  const player = useVideoPlayer(
    { uri: `${API_ORIGIN}/api/nvr/recordings/${recording.id}/download`, headers: token ? { Authorization: `Bearer ${token}` } : undefined },
    (p) => p.play()
  );

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, paddingTop: spacing.xxl, backgroundColor: colors.bg }}>
        <View>
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{recording.camera.name}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11.5 }}>{dayjs(recording.startedAt).format("DD MMM YYYY HH:mm")}</Text>
        </View>
        <TouchableOpacity onPress={onClose}>
          <Ionicons name="close" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>
      <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls />
    </View>
  );
}

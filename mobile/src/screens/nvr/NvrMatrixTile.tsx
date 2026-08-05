import { useEffect } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { VideoView, useVideoPlayer } from "expo-video";
import { useTheme } from "../../theme/ThemeContext";
import { useHlsStream } from "../../lib/useHlsStream";
import { Camera } from "../../types/nvr";

// One grid cell of LiveVideoMatrixScreen — owns its own player + stream session so tiles start,
// fail, and reconnect independently (mirrors client/src/pages/nvr/MatrixTile.tsx's per-tile
// useRtspStream instance).
export function NvrMatrixTile({ camera, onRemove }: { camera: Camera; onRemove: () => void }) {
  const { colors, radius } = useTheme();
  const player = useVideoPlayer(null, (p) => {
    p.muted = true;
  });
  const { status, error, start, stop } = useHlsStream(player, camera.streamUrl, camera.id);

  useEffect(() => {
    if (camera.streamUrl) start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera.id]);

  const isLive = status === "ready";

  return (
    <View style={{ flex: 1, aspectRatio: 4 / 3, backgroundColor: "#000", borderRadius: radius.sm ?? 6, overflow: "hidden", position: "relative" }}>
      {isLive ? (
        <VideoView player={player} style={{ width: "100%", height: "100%" }} contentFit="cover" nativeControls={false} />
      ) : (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 8 }}>
          {status === "starting" || status === "reconnecting" ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="videocam-off-outline" size={18} color="#7b8497" />}
          {status === "failed" && <Text style={{ color: "#7b8497", fontSize: 9.5, textAlign: "center", marginTop: 4 }} numberOfLines={2}>{error}</Text>}
        </View>
      )}
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#0007", paddingHorizontal: 6, paddingVertical: 3 }}>
        <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700", flex: 1 }} numberOfLines={1}>{camera.name}</Text>
        <TouchableOpacity onPress={onRemove} hitSlop={6}>
          <Ionicons name="close" size={13} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

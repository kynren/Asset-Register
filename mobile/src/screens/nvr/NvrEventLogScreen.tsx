import { useQuery } from "@tanstack/react-query";
import { FlatList, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { ShimmerList } from "../../components/Shimmer";

interface CameraEvent {
  id: number;
  type: string;
  message: string | null;
  createdAt: string;
  camera: { name: string } | null;
  nvr: { name: string } | null;
}

const TYPE_TONE: Record<string, "success" | "danger" | "warning" | "primary"> = { ONLINE: "success", OFFLINE: "danger", MOTION: "warning", PTZ_COMMAND: "primary" };
const TYPE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = { ONLINE: "checkmark-circle-outline", OFFLINE: "close-circle-outline", MOTION: "walk-outline", PTZ_COMMAND: "move-outline" };

// Mirrors client/src/pages/nvr/EventLogTab.tsx.
export function NvrEventLogScreen() {
  const { colors, spacing, radius } = useTheme();
  const { data: events, isLoading } = useQuery({ queryKey: ["mobile-camera-events"], queryFn: async () => (await axiosClient.get("/nvr/events")).data as CameraEvent[], refetchInterval: 15_000 });

  const toneColor = (t: "success" | "danger" | "warning" | "primary") => (t === "success" ? colors.success : t === "danger" ? colors.danger : t === "warning" ? colors.warning : colors.primary);

  if (isLoading) return <ShimmerList />;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      data={events ?? []}
      keyExtractor={(e) => String(e.id)}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
      ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center" }}>No events recorded yet.</Text>}
      renderItem={({ item: e }) => {
        const iconColor = e.type in TYPE_TONE ? toneColor(TYPE_TONE[e.type]) : colors.textMuted;
        return (
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name={TYPE_ICON[e.type] ?? "ellipse-outline"} size={16} color={iconColor} />
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700", flex: 1 }}>{e.type.replace(/_/g, " ")}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>{dayjs(e.createdAt).format("DD MMM, HH:mm:ss")}</Text>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 4 }}>{e.camera?.name ?? e.nvr?.name ?? "—"}</Text>
            {e.message && <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 2 }}>{e.message}</Text>}
          </View>
        );
      }}
    />
  );
}

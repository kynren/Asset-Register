import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { MoreStackParamList } from "../../navigation/types";

const ITEMS: { key: string; label: string; description: string; icon: keyof typeof Ionicons.glyphMap; route: keyof MoreStackParamList }[] = [
  { key: "cameras", label: "Cameras", description: "Browse NVRs, camera status & events", icon: "videocam-outline", route: "CameraList" },
  { key: "matrix", label: "Live Video Matrix", description: "Watch up to 4 cameras at once", icon: "grid-outline", route: "LiveVideoMatrix" },
  { key: "playback", label: "Playback Center", description: "Browse and play back recordings", icon: "play-circle-outline", route: "PlaybackCenter" },
];

export function NvrHomeScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}>
      {ITEMS.map((item) => (
        <TouchableOpacity
          key={item.key}
          style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border }}
          onPress={() => navigation.navigate(item.route as any)}
        >
          <Ionicons name={item.icon} size={20} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{item.label}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>{item.description}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

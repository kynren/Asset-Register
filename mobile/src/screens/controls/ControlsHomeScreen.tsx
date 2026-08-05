import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "../../auth/AuthContext";
import { ModuleName } from "../../lib/permissions";
import { useTheme } from "../../theme/ThemeContext";
import { MoreStackParamList } from "../../navigation/types";

const ITEMS: { key: string; label: string; description: string; icon: keyof typeof Ionicons.glyphMap; module: ModuleName; route: keyof MoreStackParamList }[] = [
  { key: "lighting", label: "Lighting", description: "Toggle devices, activate scenes", icon: "bulb-outline", module: "lighting", route: "LightingList" },
  { key: "access-control", label: "Access Control", description: "Remote-open doors", icon: "key-outline", module: "access-control", route: "DoorList" },
  { key: "gates", label: "Gates", description: "Paxton Net2 server registration & discovery", icon: "server-outline", module: "gates", route: "Gates" },
];

export function ControlsHomeScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();

  const visible = ITEMS.filter((item) => hasPermission(item.module, "view"));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}>
      {visible.map((item) => (
        <TouchableOpacity
          key={item.key}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
            backgroundColor: colors.surface,
            borderRadius: radius.md,
            padding: spacing.md,
            borderWidth: 1,
            borderColor: colors.border,
          }}
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

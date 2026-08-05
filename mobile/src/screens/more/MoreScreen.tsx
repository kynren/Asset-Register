import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "../../auth/AuthContext";
import { ModuleName } from "../../lib/permissions";
import { useTheme } from "../../theme/ThemeContext";
import { MoreStackParamList } from "../../navigation/types";

interface MoreItem {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  module?: ModuleName;
  // For items whose target screen fans out into more than one gated sub-area (e.g. Controls ->
  // Lighting + Access Control) — visible if the user can view ANY of these, sub-navigation
  // handles filtering the individual items itself.
  anyModule?: ModuleName[];
  route: keyof MoreStackParamList;
  comingSoonLabel?: string;
}

// Everything not promoted to a bottom tab lives here — same pattern as the web sidebar's grouped
// nav, just collapsed into one flat list since a phone has no room for a persistent sidebar.
const ITEMS: MoreItem[] = [
  { key: "notifications", label: "Notifications", icon: "notifications-outline", route: "Notifications" },
  { key: "profile", label: "Profile", icon: "person-circle-outline", route: "Profile" },
  { key: "network", label: "Network Topology Map", icon: "git-network-outline", module: "network", route: "NetworkList" },
  { key: "operations", label: "Operations Tools", icon: "briefcase-outline", module: "operations", route: "OperationsHome" },
  { key: "controls", label: "Controls", icon: "options-outline", anyModule: ["lighting", "access-control"], route: "ControlsHome" },
  { key: "nvr", label: "NVR & Cameras", icon: "videocam-outline", module: "nvr", route: "NvrHome" },
  { key: "docs", label: "Docs & SOPs", icon: "document-text-outline", module: "docs", route: "DocsList" },
  { key: "reports", label: "Reports", icon: "bar-chart-outline", module: "reports", route: "ReportList" },
  { key: "virtual-assistant", label: "Virtual Assistant", icon: "sparkles-outline", module: "virtual-assistant", route: "Assistant" },
  { key: "password", label: "Password Management", icon: "lock-closed-outline", module: "password", route: "VaultList" },
  { key: "admin", label: "Admin & Setup", icon: "settings-outline", anyModule: ["admin", "app-settings"], route: "AdminHome" },
];

export function MoreScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();

  const visible = ITEMS.filter((item) => {
    if (item.anyModule) return item.anyModule.some((m) => hasPermission(m, "view"));
    return !item.module || hasPermission(item.module, "view");
  });

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
          onPress={() =>
            (navigation.navigate as any)(item.route, item.route === "ComingSoon" ? { label: item.comingSoonLabel } : undefined)
          }
        >
          <Ionicons name={item.icon} size={20} color={colors.primary} />
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600", flex: 1 }}>{item.label}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

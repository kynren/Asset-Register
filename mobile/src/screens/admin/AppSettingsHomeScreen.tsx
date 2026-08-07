import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { MoreStackParamList } from "../../navigation/types";

// Mirrors client/src/pages/appSettings/AppSettingsPage.tsx's tab set — the subset mobile has
// screens for. Distinct from AdminHomeScreen (module "admin") the same way web treats "Admin &
// Setup" and "App Settings" as two separate top-level nav items, not one merged screen.
const ITEMS: { key: string; label: string; description: string; icon: keyof typeof Ionicons.glyphMap; route: keyof MoreStackParamList }[] = [
  { key: "organizations", label: "Organizations", description: "System Admin: create, edit & switch organizations", icon: "briefcase-outline", route: "OrganizationList" },
  { key: "settings", label: "System Settings", description: "Policy, network relay, agent keys", icon: "settings-outline", route: "SystemSettings" },
  { key: "backups", label: "Backups", description: "Database backup history & schedule", icon: "cloud-download-outline", route: "Backups" },
  { key: "dbmanager", label: "Database Manager", description: "Browse tables & relationships", icon: "server-outline", route: "DatabaseTableList" },
  { key: "media", label: "Media Center", description: "Media library & attachments", icon: "images-outline", route: "MediaCenter" },
  { key: "agentlog", label: "Agent Log", description: "Relay agent activity", icon: "terminal-outline", route: "AgentLog" },
];

export function AppSettingsHomeScreen() {
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

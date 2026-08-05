import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { MoreStackParamList } from "../../navigation/types";

const ITEMS: { key: string; label: string; description: string; icon: keyof typeof Ionicons.glyphMap; route: keyof MoreStackParamList; params?: any }[] = [
  { key: "users", label: "Users", description: "Accounts, roles, reset passwords", icon: "people-outline", route: "UserList" },
  { key: "roles", label: "Roles & Permissions", description: "Permission matrix per role", icon: "shield-checkmark-outline", route: "RoleList" },
  { key: "settings", label: "System Settings", description: "Policy, network relay, agent keys", icon: "settings-outline", route: "SystemSettings" },
  { key: "email", label: "Email Templates", description: "Notification email designs", icon: "mail-outline", route: "EmailTemplateList" },
  { key: "agentlog", label: "Agent Log", description: "Relay agent activity", icon: "terminal-outline", route: "AgentLog" },
  { key: "backups", label: "Backups", description: "Database backup history & schedule", icon: "cloud-download-outline", route: "Backups" },
  { key: "dbmanager", label: "Database Manager", description: "Browse tables & relationships", icon: "server-outline", route: "DatabaseTableList" },
  { key: "media", label: "Media Center", description: "Media library & attachments", icon: "images-outline", route: "MediaCenter" },
  { key: "organizations", label: "Organizations", description: "System Admin: create, edit & switch organizations", icon: "briefcase-outline", route: "OrganizationList" },
];

export function AdminHomeScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const { hasPermission } = useAuth();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}>
      {ITEMS.filter((item) => item.key === "settings" || item.key === "backups" || item.key === "organizations" ? hasPermission("app-settings", "view") : hasPermission("admin", "view")).map((item) => (
        <TouchableOpacity
          key={item.key}
          style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border }}
          onPress={() => navigation.navigate(item.route as any, item.params)}
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

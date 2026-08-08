import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { MoreStackParamList } from "../../navigation/types";

// Mirrors client/src/pages/admin/AdminPage.tsx's tab set — the subset mobile has screens for.
// System Settings/Backups/Database Manager/Media Center/Agent Log/Organizations moved to
// AppSettingsHomeScreen (module "app-settings"), matching web where those live on AppSettingsPage
// instead of AdminPage.
const ITEMS: { key: string; label: string; description: string; icon: keyof typeof Ionicons.glyphMap; route: keyof MoreStackParamList }[] = [
  { key: "users", label: "Users", description: "Accounts, roles, reset passwords", icon: "people-outline", route: "UserList" },
  { key: "roles", label: "Roles & Permissions", description: "Permission matrix per role", icon: "shield-checkmark-outline", route: "RoleList" },
  { key: "email", label: "Email Templates", description: "Notification email designs", icon: "mail-outline", route: "EmailTemplateList" },
  { key: "teams", label: "Teams", description: "Team membership for ticket assignment", icon: "people-circle-outline", route: "TeamList" },
  { key: "categoriesLocations", label: "Categories & Locations", description: "Asset categories, form templates, locations, ticket categories", icon: "folder-outline", route: "CategoriesLocations" },
  { key: "helpdeskConfig", label: "Helpdesk Config", description: "Templates, SLAs, recurring tickets, business rules, settings", icon: "construct-outline", route: "HelpdeskConfig" },
  { key: "automationRules", label: "Automation Rules", description: "Condition/action rules for Assets and Stock", icon: "flash-outline", route: "AutomationRules" },
  { key: "audit", label: "Audit Log", description: "Admin action history", icon: "list-outline", route: "AuditLog" },
  { key: "toasts", label: "Toast Designer", description: "In-app notification style", icon: "chatbox-outline", route: "ToastSettings" },
  { key: "emailIngest", label: "Email Ingestion", description: "IMAP email-to-ticket settings", icon: "at-outline", route: "EmailIngestSettings" },
];

export function AdminHomeScreen() {
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

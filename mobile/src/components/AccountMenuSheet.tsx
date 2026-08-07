import { useNavigation } from "@react-navigation/native";
import { Alert, Image, Modal, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { API_ORIGIN } from "../config/env";
import { useAuth } from "../auth/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { navigateToNotifications } from "../navigation/navigationRef";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSync: () => void;
  isSyncing: boolean;
  unreadCount: number;
}

interface MenuItem {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  screen: string;
  badge?: number;
  visible?: boolean;
}

// Full-screen account menu opened by tapping the avatar in AppHeader — same shape as the
// "account sheet" pattern common to field-ops apps: identity block up top, a flat list of
// account-level destinations, sync status pinned at the bottom.
export function AccountMenuSheet({ visible, onClose, onSync, isSyncing, unreadCount }: Props) {
  const { colors, spacing, radius } = useTheme();
  const { user, organization, hasPermission, logout } = useAuth();
  const navigation = useNavigation<any>();

  function go(screen: string) {
    onClose();
    if (screen === "Notifications") {
      navigateToNotifications();
      return;
    }
    navigation.getParent()?.navigate("MoreTab", { screen });
  }

  function confirmLogout() {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: () => {
          onClose();
          logout();
        },
      },
    ]);
  }

  const items = (
    [
      { key: "profile", label: "My Profile", icon: "person-circle-outline", screen: "Profile", visible: true },
      { key: "notifications", label: "Notifications", icon: "notifications-outline", screen: "Notifications", badge: unreadCount, visible: true },
      { key: "password", label: "Password Management", icon: "lock-closed-outline", screen: "VaultList", visible: hasPermission("password", "view") },
      { key: "docs", label: "Docs & SOPs", icon: "document-text-outline", screen: "DocsList", visible: hasPermission("docs", "view") },
      { key: "admin", label: "Admin & Setup", icon: "settings-outline", screen: "AdminHome", visible: hasPermission("admin", "view") || hasPermission("app-settings", "view") },
    ] as MenuItem[]
  ).filter((i) => i.visible);

  const initial = user?.firstName?.[0]?.toUpperCase() ?? "?";
  const avatarUrl = user?.avatarUrl ? `${API_ORIGIN}${user.avatarUrl}` : null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xxl, paddingBottom: spacing.lg }}>
            <TouchableOpacity onPress={onClose} style={{ marginBottom: spacing.lg }} accessibilityLabel="Close">
              <Ionicons name="close" size={26} color={colors.text} />
            </TouchableOpacity>

            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={{ width: 56, height: 56, borderRadius: 28 }} />
              ) : (
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#fff", fontSize: 22, fontWeight: "800" }}>{initial}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: "800" }}>
                  {user?.firstName} {user?.lastName}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>{user?.email}</Text>
                {organization?.name && <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>{organization.name}</Text>}
              </View>
            </View>
          </View>

          <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm }}>
            {items.map((item) => (
              <TouchableOpacity
                key={item.key}
                style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 14 }}
                onPress={() => go(item.screen)}
              >
                <Ionicons name={item.icon} size={21} color={colors.text} />
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600", flex: 1 }}>{item.label}</Text>
                {!!item.badge && (
                  <View style={{ minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: "#fff", fontSize: 10.5, fontWeight: "800" }}>{item.badge > 99 ? "99+" : item.badge}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 14 }}
              onPress={confirmLogout}
            >
              <Ionicons name="log-out-outline" size={21} color={colors.danger} />
              <Text style={{ color: colors.danger, fontSize: 15, fontWeight: "700" }}>Log out</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <TouchableOpacity
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
            margin: spacing.lg,
            padding: spacing.md,
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
          }}
          onPress={onSync}
          disabled={isSyncing}
        >
          <Ionicons name={isSyncing ? "sync" : "checkmark-circle-outline"} size={20} color={isSyncing ? colors.primary : colors.success} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "700" }}>{isSyncing ? "Syncing…" : "Sync complete"}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 1 }}>{isSyncing ? "Refreshing your data" : "All items are up to date."}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

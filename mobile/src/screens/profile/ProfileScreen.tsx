import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../../auth/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { MoreStackParamList } from "../../navigation/types";

export function ProfileScreen() {
  const { colors, spacing, radius } = useTheme();
  const { user, organization, logout } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();

  function confirmLogout() {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: () => logout() },
    ]);
  }

  const rows = [
    { label: "Email", value: user?.email },
    { label: "Role", value: user?.roleName },
    { label: "Organization", value: organization?.name },
    { label: "MFA", value: user?.mfaEnabled ? "Enabled" : "Disabled" },
    { label: "PIN login", value: user?.pinEnabled ? "Enabled" : "Disabled" },
    { label: "Last login", value: user?.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "—" },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={[styles.avatarWrap, { backgroundColor: colors.primary, borderRadius: radius.pill }]}>
        <Text style={styles.avatarInitial}>{user?.firstName?.[0]?.toUpperCase() ?? "?"}</Text>
      </View>
      <Text style={[styles.name, { color: colors.text }]}>
        {user?.firstName} {user?.lastName}
      </Text>

      <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.lg, borderColor: colors.border, marginTop: spacing.lg }]}>
        {rows.map((r, i) => (
          <View
            key={r.label}
            style={[styles.row, i < rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
          >
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>{r.label}</Text>
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{r.value ?? "—"}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          padding: spacing.md,
          borderWidth: 1,
          borderColor: colors.border,
          marginTop: spacing.lg,
        }}
        onPress={() => navigation.navigate("NotificationPreferences")}
      >
        <Ionicons name="notifications-outline" size={20} color={colors.primary} />
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600", flex: 1 }}>Notification Preferences</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </TouchableOpacity>

      <TouchableOpacity
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          padding: spacing.md,
          borderWidth: 1,
          borderColor: colors.border,
          marginTop: spacing.sm,
        }}
        onPress={() => navigation.navigate("Appearance")}
      >
        <Ionicons name="color-palette-outline" size={20} color={colors.primary} />
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600", flex: 1 }}>Appearance</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.logoutButton, { borderColor: colors.danger, borderRadius: radius.md, marginTop: spacing.xl }]}
        onPress={confirmLogout}
      >
        <Text style={{ color: colors.danger, fontWeight: "700" }}>Log out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  avatarWrap: { width: 72, height: 72, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  avatarInitial: { color: "#fff", fontSize: 28, fontWeight: "800" },
  name: { textAlign: "center", fontSize: 18, fontWeight: "700", marginTop: 12 },
  card: { borderWidth: 1, paddingHorizontal: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14 },
  logoutButton: { borderWidth: 1.5, alignItems: "center", paddingVertical: 14 },
});

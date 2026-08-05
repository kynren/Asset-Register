import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { FlatList, Image, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { MoreStackParamList } from "../../navigation/types";

interface OrganizationRow {
  id: number;
  name: string;
  schemaName: string;
  createdAt: string;
  logoUrl: string | null;
}

// Mirrors client/src/pages/appSettings/OrganizationsTab.tsx — every organization gets its own
// isolated database schema; creating one here provisions that schema and its first Super Admin.
export function OrganizationListScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const { organization, hasPermission } = useAuth();

  const { data, isLoading } = useQuery({ queryKey: ["mobile-app-settings-organizations"], queryFn: async () => (await axiosClient.get("/app-settings/organizations")).data as OrganizationRow[] });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
        <Text style={{ color: colors.textMuted, fontSize: 11.5 }}>
          Creating an organization provisions its own isolated schema and first Super Admin user. Use the arrow to switch into one and manage it.
        </Text>
      </View>
      <FlatList
        data={data ?? []}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.sm, paddingBottom: 80 }}
        refreshing={isLoading}
        renderItem={({ item }) => {
          const isActive = item.id === organization?.id;
          return (
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: isActive ? colors.primary : colors.border, padding: spacing.md }}>
              <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", overflow: "hidden", marginRight: spacing.sm }}>
                {item.logoUrl ? <Image source={{ uri: item.logoUrl }} style={{ width: "100%", height: "100%" }} /> : <Ionicons name="briefcase-outline" size={18} color={colors.textMuted} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "700" }}>{item.name}{isActive ? " (current)" : ""}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2, fontFamily: "monospace" }}>{item.schemaName}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 10.5, marginTop: 2 }}>Created {dayjs(item.createdAt).format("DD MMM YYYY")}</Text>
              </View>
              <TouchableOpacity style={{ padding: 6 }} disabled={isActive} onPress={() => navigation.navigate("SwitchOrganization", { id: item.id, name: item.name })}>
                <Ionicons name={isActive ? "checkmark-circle" : "arrow-forward-circle-outline"} size={22} color={isActive ? colors.success : colors.primary} />
              </TouchableOpacity>
              {hasPermission("app-settings", "edit") && (
                <TouchableOpacity style={{ padding: 6 }} onPress={() => navigation.navigate("OrganizationForm", { id: item.id })}>
                  <Ionicons name="create-outline" size={20} color={colors.text} />
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />
      {hasPermission("app-settings", "create") && (
        <TouchableOpacity
          style={{ position: "absolute", right: spacing.lg, bottom: spacing.lg, backgroundColor: colors.primary, borderRadius: 28, width: 56, height: 56, alignItems: "center", justifyContent: "center", elevation: 4 }}
          onPress={() => navigation.navigate("OrganizationForm", undefined)}
        >
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

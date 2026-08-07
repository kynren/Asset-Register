import { useLayoutEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { MODULES, ModuleName } from "../../lib/permissions";
import { MoreStackParamList } from "../../navigation/types";

interface RolePermission {
  module: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canExport: boolean;
  canImport: boolean;
  canDuplicate: boolean;
  scopeAssignedOnly?: boolean;
}
interface Role {
  id: number;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: RolePermission[];
}

type PermAction = "canView" | "canCreate" | "canEdit" | "canDelete" | "canExport" | "canImport" | "canDuplicate";
const ACTIONS: PermAction[] = ["canView", "canCreate", "canEdit", "canDelete", "canExport", "canImport", "canDuplicate"];
const ACTION_LABELS: Record<PermAction, string> = { canView: "View", canCreate: "Create", canEdit: "Edit", canDelete: "Delete", canExport: "Export", canImport: "Import", canDuplicate: "Duplicate" };

// Mirrors client/src/pages/admin/RolesTab.tsx's permission matrix — one card per module (a table
// doesn't fit a phone width) with toggle chips for each action. The Change Management
// schedule-vs-publish-now workflow stays web-only; mobile always saves immediately.
const MODULE_LABELS: Record<ModuleName, string> = {
  dashboard: "Dashboard",
  assets: "Asset Inventory",
  harness: "Harness Register",
  "operational-context": "Operational Context",
  network: "Network Topology Map",
  stock: "Stock Register & Analytics",
  helpdesk: "Helpdesk & Ticketing",
  operations: "Operations Tools",
  nvr: "NVRs & Cameras",
  "access-control": "Access Control",
  lighting: "Lighting",
  gates: "Gates",
  "virtual-assistant": "Virtual Assistant",
  docs: "Docs & SOPs",
  reports: "Reports",
  admin: "Admin & Setup",
  password: "Password Management",
  "app-settings": "App Settings",
  branding: "Branding",
};

function buildFullMatrix(perms: RolePermission[]): RolePermission[] {
  return MODULES.map((m) => perms.find((p) => p.module === m) ?? { module: m, canView: false, canCreate: false, canEdit: false, canDelete: false, canExport: false, canImport: false, canDuplicate: false, scopeAssignedOnly: false });
}

export function RolePermissionsScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<MoreStackParamList, "RolePermissions">>();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const { id } = route.params;
  const canEditAdmin = hasPermission("admin", "edit");

  const { data: role, isLoading } = useQuery({ queryKey: ["mobile-role", id], queryFn: async () => (await axiosClient.get(`/roles`)).data.find((r: Role) => r.id === id) as Role | undefined });
  const [draft, setDraft] = useState<RolePermission[] | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: role?.name ?? "Role" });
  }, [navigation, role]);

  const isSystemAdminRole = role?.name === "System Admin";
  const activePermissions = draft ?? role?.permissions ?? [];
  const matrix = buildFullMatrix(activePermissions);

  const saveMutation = useMutation({
    mutationFn: () => axiosClient.put(`/roles/${id}/permissions`, { permissions: buildFullMatrix(activePermissions) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-role", id] });
      queryClient.invalidateQueries({ queryKey: ["mobile-roles"] });
      setDraft(null);
    },
  });

  function toggle(module: ModuleName, action: PermAction) {
    if (isSystemAdminRole || !canEditAdmin) return;
    setDraft(buildFullMatrix(activePermissions).map((p) => (p.module === module ? { ...p, [action]: !p[action] } : p)));
  }
  function toggleScope(module: ModuleName) {
    if (isSystemAdminRole || !canEditAdmin) return;
    setDraft(buildFullMatrix(activePermissions).map((p) => (p.module === module ? { ...p, scopeAssignedOnly: !p.scopeAssignedOnly } : p)));
  }

  if (isLoading || !role) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 90 }}>
        {isSystemAdminRole && (
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.md }}>Always full access — cannot be edited.</Text>
        )}
        {MODULES.filter((m) => m !== "app-settings" || isSystemAdminRole).map((module) => {
          const perm = matrix.find((p) => p.module === module)!;
          return (
            <View key={module} style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm }}>
              <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "700", marginBottom: 8 }}>{MODULE_LABELS[module]}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {ACTIONS.map((a) => {
                  const active = isSystemAdminRole ? true : perm[a];
                  return (
                    <TouchableOpacity
                      key={a}
                      style={{ borderWidth: 1, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "22" : colors.bg, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 7, opacity: isSystemAdminRole || !canEditAdmin ? 0.7 : 1 }}
                      disabled={isSystemAdminRole || !canEditAdmin}
                      onPress={() => toggle(module, a)}
                    >
                      <Text style={{ color: active ? colors.primary : colors.text, fontSize: 11.5, fontWeight: "700" }}>{ACTION_LABELS[a]}</Text>
                    </TouchableOpacity>
                  );
                })}
                {module === "helpdesk" && (
                  <TouchableOpacity
                    style={{ flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: perm.scopeAssignedOnly ? colors.warning : colors.border, backgroundColor: perm.scopeAssignedOnly ? colors.warning + "22" : colors.bg, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 7 }}
                    disabled={isSystemAdminRole || !canEditAdmin}
                    onPress={() => toggleScope(module)}
                  >
                    <Text style={{ color: perm.scopeAssignedOnly ? colors.warning : colors.text, fontSize: 11.5, fontWeight: "700" }}>Assigned to Me Only</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {!isSystemAdminRole && canEditAdmin && (
        <View style={{ position: "absolute", left: spacing.lg, right: spacing.lg, bottom: spacing.lg }}>
          <TouchableOpacity
            style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 14, opacity: draft ? 1 : 0.5, elevation: 4 }}
            disabled={!draft || saveMutation.isPending}
            onPress={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Save Permissions</Text>}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

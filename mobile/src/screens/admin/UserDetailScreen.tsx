import { useLayoutEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, Alert, ScrollView, Switch, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useAuth } from "../../auth/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { useToast } from "../../components/toast/ToastProvider";
import { AdminUser, Role } from "../../types/admin";
import { MoreStackParamList } from "../../navigation/types";

export function UserDetailScreen() {
  const { colors, spacing, radius } = useTheme();
  const { user: currentUser, hasPermission } = useAuth();
  const { showToast } = useToast();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const route = useRoute<RouteProp<MoreStackParamList, "UserDetail">>();
  const { id } = route.params;
  const queryClient = useQueryClient();
  const [rolePickerOpen, setRolePickerOpen] = useState(false);

  const { data: user, isLoading } = useQuery({
    queryKey: ["mobile-admin-user", id],
    queryFn: async () => (await axiosClient.get(`/users/${id}`)).data as AdminUser,
  });

  const { data: roles } = useQuery({
    queryKey: ["mobile-admin-roles"],
    queryFn: async () => (await axiosClient.get("/roles")).data as Role[],
  });

  const canEdit = hasPermission("admin", "edit");
  const isSelf = currentUser?.id === id;

  const updateMutation = useMutation({
    mutationFn: (data: Partial<{ isActive: boolean; roleId: number }>) => axiosClient.patch(`/users/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-admin-user", id] });
      queryClient.invalidateQueries({ queryKey: ["mobile-admin-users"] });
    },
    onError: (err: any) => showToast({ variant: "error", title: "Couldn't update user", message: err?.response?.data?.error ?? "Try again." }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: () => axiosClient.post(`/users/${id}/reset-password`, {}),
    onSuccess: (res) => {
      Alert.alert("Password reset", `Temporary password:\n\n${res.data.tempPassword}\n\nShare this with the user securely — they'll be required to change it on next login.`);
    },
  });

  function confirmResetPassword() {
    Alert.alert("Reset password", `Generate a new temporary password for ${user?.firstName}? They'll be required to change it on next login.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Reset", onPress: () => resetPasswordMutation.mutate() },
    ]);
  }

  useLayoutEffect(() => {
    navigation.setOptions({ title: user ? `${user.firstName} ${user.lastName}` : "User" });
  }, [navigation, user]);

  if (isLoading || !user) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const roleOptions: PickerOption[] = (roles ?? []).map((r) => ({ id: r.id, label: r.name }));

  const rows: [string, string | null][] = [
    ["Email", user.email],
    ["Last login", user.lastLoginAt ? dayjs(user.lastLoginAt).format("DD MMM YYYY HH:mm") : "Never"],
    ["Account created", dayjs(user.createdAt).format("DD MMM YYYY")],
    ["Must change password", user.mustChangePassword ? "Yes (next login)" : "No"],
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.lg }}>
        <View>
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>Active</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 1 }}>{user.isActive ? "Can sign in" : "Cannot sign in"}</Text>
        </View>
        <Switch
          value={user.isActive}
          disabled={!canEdit || isSelf || updateMutation.isPending}
          onValueChange={(isActive) => updateMutation.mutate({ isActive })}
          trackColor={{ true: colors.primary, false: colors.border }}
        />
      </View>

      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 6, textTransform: "uppercase" }}>Role</Text>
      <TouchableOpacity
        disabled={!canEdit}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surface, marginBottom: spacing.lg }}
        onPress={() => setRolePickerOpen(true)}
      >
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>{updateMutation.isPending ? "Updating…" : user.role.name}</Text>
        {canEdit && <Ionicons name="chevron-down" size={16} color={colors.textMuted} />}
      </TouchableOpacity>

      <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, marginBottom: spacing.lg }}>
        {rows.map(([label, value], i, arr) => (
          <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>{label}</Text>
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{value}</Text>
          </View>
        ))}
      </View>

      {canEdit && (
        <TouchableOpacity
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.md, paddingVertical: 13 }}
          onPress={confirmResetPassword}
          disabled={resetPasswordMutation.isPending}
        >
          {resetPasswordMutation.isPending ? <ActivityIndicator color={colors.primary} size="small" /> : <Ionicons name="key-outline" size={16} color={colors.primary} />}
          <Text style={{ color: colors.primary, fontWeight: "700" }}>Reset password</Text>
        </TouchableOpacity>
      )}

      <PickerModal
        visible={rolePickerOpen}
        title="Role"
        options={roleOptions}
        selectedId={user.roleId}
        onSelect={(v) => updateMutation.mutate({ roleId: v as number })}
        onClose={() => setRolePickerOpen(false)}
      />
    </ScrollView>
  );
}

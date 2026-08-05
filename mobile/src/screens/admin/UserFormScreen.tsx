import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { MoreStackParamList } from "../../navigation/types";

interface Role {
  id: number;
  name: string;
}

export function UserFormScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [roleId, setRoleId] = useState<number | null>(null);
  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: roles } = useQuery({ queryKey: ["mobile-roles"], queryFn: async () => (await axiosClient.get("/roles")).data as Role[] });
  const roleOptions: PickerOption[] = (roles ?? []).map((r) => ({ id: r.id, label: r.name }));

  const createMutation = useMutation({
    mutationFn: () => axiosClient.post("/users", { email: email.trim(), firstName: firstName.trim(), lastName: lastName.trim(), roleId }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["mobile-users"] });
      Alert.alert(
        "User created",
        `Temporary password for ${res.data.user.email}:\n\n${res.data.tempPassword}\n\nShare this with the user securely — they'll be required to change it on next login.`,
        [{ text: "OK", onPress: () => navigation.replace("UserDetail", { id: res.data.user.id }) }]
      );
    },
    onError: (err: any) => setError(err?.response?.data?.error ?? "Could not create user."),
  });

  const canSave = email.trim().length > 0 && firstName.trim().length > 0 && lastName.trim().length > 0 && roleId != null;
  const labelStyle = { color: colors.textMuted, fontSize: 12, fontWeight: "700" as const, marginBottom: 6, textTransform: "uppercase" as const, marginTop: spacing.md };
  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      {error && (
        <View style={{ backgroundColor: colors.danger + "22", borderRadius: radius.md, padding: 12, marginBottom: spacing.md }}>
          <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text>
        </View>
      )}

      <Text style={[labelStyle, { marginTop: 0 }]}>Email</Text>
      <TextInput style={inputStyle} placeholder="name@company.com" placeholderTextColor={colors.textMuted} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />

      <Text style={labelStyle}>First Name</Text>
      <TextInput style={inputStyle} placeholderTextColor={colors.textMuted} value={firstName} onChangeText={setFirstName} />

      <Text style={labelStyle}>Last Name</Text>
      <TextInput style={inputStyle} placeholderTextColor={colors.textMuted} value={lastName} onChangeText={setLastName} />

      <Text style={labelStyle}>Role</Text>
      <TouchableOpacity style={{ ...inputStyle, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }} onPress={() => setRolePickerOpen(true)}>
        <Text style={{ color: roleId != null ? colors.text : colors.textMuted }}>{roleOptions.find((r) => r.id === roleId)?.label ?? "Select a role..."}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
      </TouchableOpacity>

      <TouchableOpacity
        style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 15, marginTop: spacing.xl, opacity: canSave ? 1 : 0.6 }}
        disabled={!canSave || createMutation.isPending}
        onPress={() => createMutation.mutate()}
      >
        {createMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Create User</Text>}
      </TouchableOpacity>

      <PickerModal visible={rolePickerOpen} title="Select role" options={roleOptions} selectedId={roleId} onSelect={(v) => setRoleId(v == null ? null : Number(v))} onClose={() => setRolePickerOpen(false)} />
    </ScrollView>
  );
}

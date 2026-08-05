import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, FlatList, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { MoreStackParamList } from "../../navigation/types";

interface Role {
  id: number;
  name: string;
  description: string | null;
  isSystem: boolean;
}

export function RoleListScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data: roles, isLoading } = useQuery({ queryKey: ["mobile-roles"], queryFn: async () => (await axiosClient.get("/roles")).data as Role[] });

  const createMutation = useMutation({
    mutationFn: () => axiosClient.post("/roles", { name: name.trim(), description: description.trim() || undefined }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["mobile-roles"] });
      setShowCreate(false);
      setName("");
      setDescription("");
      navigation.navigate("RolePermissions", { id: res.data.id });
    },
  });

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface };

  if (isLoading) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
      data={roles ?? []}
      keyExtractor={(item) => String(item.id)}
      ListHeaderComponent={
        hasPermission("admin", "create") ? (
          !showCreate ? (
            <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12, marginBottom: spacing.md }} onPress={() => setShowCreate(true)}>
              <Ionicons name="add" size={16} color={colors.text} />
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>New Role</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 8, marginBottom: spacing.md }}>
              <TextInput style={inputStyle} placeholder="Role name" placeholderTextColor={colors.textMuted} value={name} onChangeText={setName} />
              <TextInput style={inputStyle} placeholder="Description (optional)" placeholderTextColor={colors.textMuted} value={description} onChangeText={setDescription} />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: "center", paddingVertical: 10 }} onPress={() => setShowCreate(false)}>
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12.5 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 10, opacity: name.trim() ? 1 : 0.5 }} disabled={!name.trim() || createMutation.isPending} onPress={() => createMutation.mutate()}>
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>Create</Text>
                </TouchableOpacity>
              </View>
            </View>
          )
        ) : null
      }
      renderItem={({ item }) => (
        <TouchableOpacity
          style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: 6 }}
          onPress={() => navigation.navigate("RolePermissions", { id: item.id })}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{item.name}{item.isSystem ? "" : " (custom)"}</Text>
            {item.description && <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{item.description}</Text>}
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    />
  );
}

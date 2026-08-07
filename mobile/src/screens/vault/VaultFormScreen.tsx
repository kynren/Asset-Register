import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { KeyboardAvoidingScreen } from "../../components/KeyboardAvoidingScreen";
import { VaultEntry } from "../../types/vault";
import { MoreStackParamList } from "../../navigation/types";

export function VaultFormScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const route = useRoute<RouteProp<MoreStackParamList, "VaultForm">>();
  const editingId = route.params?.id;
  const queryClient = useQueryClient();

  const { data: entries } = useQuery({
    queryKey: ["mobile-vault"],
    queryFn: async () => (await axiosClient.get("/vault")).data as VaultEntry[],
    enabled: editingId != null,
  });
  const editing = entries?.find((e) => e.id === editingId);

  const [title, setTitle] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editing) {
      setTitle(editing.title);
      setWebsiteUrl(editing.websiteUrl ?? "");
      setUsername(editing.username ?? "");
      setNotes(editing.notes ?? "");
    }
  }, [editing]);

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        title,
        websiteUrl: websiteUrl || undefined,
        username: username || undefined,
        notes: notes || undefined,
        ...(password ? { password } : {}),
      };
      return editingId ? axiosClient.patch(`/vault/${editingId}`, payload) : axiosClient.post("/vault", payload);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["mobile-vault"] });
      navigation.replace("VaultDetail", { id: editingId ?? res.data.id });
    },
    onError: (err: any) => setError(err?.response?.data?.error ?? "Failed to save vault entry."),
  });

  const canSubmit = title.trim().length > 0 && (editingId != null || password.trim().length > 0);

  return (
    <KeyboardAvoidingScreen>
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      {error && (
        <View style={{ backgroundColor: colors.danger + "22", borderRadius: radius.md, padding: 12, marginBottom: spacing.md }}>
          <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text>
        </View>
      )}

      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 6, textTransform: "uppercase" }}>Title *</Text>
      <TextInput
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface, marginBottom: 14 }}
        placeholder="e.g. Router admin"
        placeholderTextColor={colors.textMuted}
        value={title}
        onChangeText={setTitle}
      />

      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 6, textTransform: "uppercase" }}>Website</Text>
      <TextInput
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface, marginBottom: 14 }}
        placeholder="https://..."
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        value={websiteUrl}
        onChangeText={setWebsiteUrl}
      />

      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 6, textTransform: "uppercase" }}>Username</Text>
      <TextInput
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface, marginBottom: 14 }}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        value={username}
        onChangeText={setUsername}
      />

      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 6, textTransform: "uppercase" }}>
        Password {editingId ? "(leave blank to keep current)" : "*"}
      </Text>
      <TextInput
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface, marginBottom: 14 }}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 6, textTransform: "uppercase" }}>Notes</Text>
      <TextInput
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface, marginBottom: 14, height: 90, textAlignVertical: "top" }}
        placeholderTextColor={colors.textMuted}
        multiline
        value={notes}
        onChangeText={setNotes}
      />

      <TouchableOpacity
        style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 15, marginTop: spacing.md, opacity: canSubmit ? 1 : 0.6 }}
        disabled={!canSubmit || mutation.isPending}
        onPress={() => mutation.mutate()}
      >
        {mutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>{editingId ? "Save changes" : "Add vault entry"}</Text>}
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAvoidingScreen>
  );
}

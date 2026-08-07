import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { KeyboardAvoidingScreen } from "../../components/KeyboardAvoidingScreen";
import { MoreStackParamList } from "../../navigation/types";

// Quick-capture create form — title + description only. The web app's full ProjectFormModal also
// covers assignee/dates/visibility/access grants, which is desk-work editing better done at a
// keyboard; this covers "log a work item while I'm on site," the mobile-relevant slice.
export function ProjectFormScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => axiosClient.post("/operations/projects", { title, description: description || undefined }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["mobile-projects"] });
      navigation.replace("ProjectDetail", { id: res.data.id });
    },
    onError: (err: any) => setError(err?.response?.data?.error ?? "Failed to create project."),
  });

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
        placeholder="What needs doing?"
        placeholderTextColor={colors.textMuted}
        value={title}
        onChangeText={setTitle}
      />

      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 6, textTransform: "uppercase" }}>Description</Text>
      <TextInput
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface, marginBottom: 14, height: 120, textAlignVertical: "top" }}
        placeholder="Details, context, anything useful..."
        placeholderTextColor={colors.textMuted}
        value={description}
        onChangeText={setDescription}
        multiline
      />

      <TouchableOpacity
        style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 15, marginTop: spacing.md }}
        disabled={!title.trim() || mutation.isPending}
        onPress={() => mutation.mutate()}
      >
        {mutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Create project</Text>}
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAvoidingScreen>
  );
}

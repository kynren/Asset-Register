import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { KeyboardAvoidingScreen } from "../../components/KeyboardAvoidingScreen";
import { MoreStackParamList } from "../../navigation/types";

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function EmailReportScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<MoreStackParamList, "EmailReport">>();
  const { id, name } = route.params;

  const [recipients, setRecipients] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [format, setFormat] = useState<"pdf" | "csv">("pdf");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const emailMutation = useMutation({
    mutationFn: () => axiosClient.post(`/reports/${id}/email`, { to: recipients, format, message: message.trim() || undefined }),
    onSuccess: () => setSent(true),
  });

  function addRecipient() {
    const v = draft.trim();
    if (v && isValidEmail(v) && !recipients.includes(v)) {
      setRecipients([...recipients, v]);
      setDraft("");
    }
  }

  const inputStyle = { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface };
  const labelStyle = { color: colors.textMuted, fontSize: 12, fontWeight: "700" as const, marginBottom: 8, textTransform: "uppercase" as const };
  const canSend = recipients.length > 0 && !emailMutation.isPending;

  return (
    <KeyboardAvoidingScreen>
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg }}>
      {sent && (
        <View style={{ backgroundColor: colors.success + "22", borderRadius: radius.md, padding: 12, marginBottom: spacing.md }}>
          <Text style={{ color: colors.success, fontSize: 13 }}>Report emailed to {recipients.length} recipient{recipients.length === 1 ? "" : "s"}.</Text>
        </View>
      )}

      <Text style={labelStyle}>Recipients</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {recipients.map((r) => (
          <View key={r} style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ color: colors.text, fontSize: 11.5 }}>{r}</Text>
            <TouchableOpacity onPress={() => setRecipients(recipients.filter((x) => x !== r))}>
              <Ionicons name="close" size={12} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: spacing.md }}>
        <TextInput
          style={inputStyle}
          placeholder="name@company.com"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          keyboardType="email-address"
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={addRecipient}
        />
        <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, justifyContent: "center", opacity: isValidEmail(draft.trim()) ? 1 : 0.5 }} disabled={!isValidEmail(draft.trim())} onPress={addRecipient}>
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>Add</Text>
        </TouchableOpacity>
      </View>

      <Text style={labelStyle}>Format</Text>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: spacing.md }}>
        {(["pdf", "csv"] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={{ borderWidth: 1, borderColor: format === f ? colors.primary : colors.border, backgroundColor: format === f ? colors.primary + "22" : colors.surface, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8 }}
            onPress={() => setFormat(f)}
          >
            <Text style={{ color: format === f ? colors.primary : colors.text, fontSize: 12.5, fontWeight: "700" }}>{f.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={labelStyle}>Message (optional)</Text>
      <TextInput
        style={{ ...inputStyle, minHeight: 80, textAlignVertical: "top", marginBottom: spacing.lg }}
        placeholder="Add a note for the recipient(s)..."
        placeholderTextColor={colors.textMuted}
        multiline
        value={message}
        onChangeText={setMessage}
      />

      <TouchableOpacity
        style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 15, opacity: canSend ? 1 : 0.6 }}
        disabled={!canSend}
        onPress={() => emailMutation.mutate()}
      >
        {emailMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Send "{name}"</Text>}
      </TouchableOpacity>
    </View>
    </KeyboardAvoidingScreen>
  );
}

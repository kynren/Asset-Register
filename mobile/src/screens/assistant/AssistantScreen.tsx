import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { AssistantResult, ChatMessage } from "../../types/assistant";

let seq = 0;
function nextId() {
  seq += 1;
  return String(seq);
}

// Same pattern-matched query engine as the web app's floating assistant widget (see
// server/src/modules/assistant/patterns.ts) — this is a full-screen chat shell around the exact
// same POST /assistant/query endpoint, no separate mobile-specific assistant logic.
export function AssistantScreen() {
  const { colors, spacing, radius } = useTheme();
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: nextId(), role: "assistant", text: "Hi! Ask me about assets, tickets, licenses, warranties, stock, or offline devices." },
  ]);

  const { data: quickActionsData } = useQuery({
    queryKey: ["mobile-assistant-quick-actions"],
    queryFn: async () => (await axiosClient.get("/assistant/quick-actions")).data as { quickActions: string[] },
  });

  const mutation = useMutation({
    mutationFn: (text: string) => axiosClient.post("/assistant/query", { text }),
    onSuccess: (res) => {
      const result = res.data as AssistantResult;
      setMessages((prev) => [...prev, { id: nextId(), role: "assistant", text: result.answer }]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    },
    onError: () => {
      setMessages((prev) => [...prev, { id: nextId(), role: "assistant", text: "Something went wrong answering that — try again." }]);
    },
  });

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || mutation.isPending) return;
    setMessages((prev) => [...prev, { id: nextId(), role: "user", text: trimmed }]);
    setInput("");
    mutation.mutate(trimmed);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <FlatList
        ref={listRef}
        style={{ flex: 1 }}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => (
          <View
            style={{
              alignSelf: item.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "85%",
              backgroundColor: item.role === "user" ? colors.primary : colors.surface,
              borderWidth: item.role === "user" ? 0 : 1,
              borderColor: colors.border,
              borderRadius: radius.md,
              paddingHorizontal: 14,
              paddingVertical: 10,
            }}
          >
            <Text style={{ color: item.role === "user" ? "#fff" : colors.text, fontSize: 13.5, lineHeight: 19 }}>{item.text}</Text>
          </View>
        )}
        ListFooterComponent={
          mutation.isPending ? (
            <View style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10 }}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>Thinking…</Text>
            </View>
          ) : null
        }
      />

      {!!quickActionsData?.quickActions.length && (
        <FlatList
          horizontal
          style={{ flexGrow: 0 }}
          showsHorizontalScrollIndicator={false}
          data={quickActionsData.quickActions}
          keyExtractor={(q) => q}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm, alignItems: "flex-start" }}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => send(item)}
              style={{ alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primary }}
            >
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "600" }}>{item}</Text>
            </TouchableOpacity>
          )}
        />
      )}

      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.lg, paddingTop: 0 }}>
        <TextInput
          style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 10, color: colors.text, backgroundColor: colors.surface }}
          placeholder="Ask a question..."
          placeholderTextColor={colors.textMuted}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => send(input)}
          returnKeyType="send"
        />
        <TouchableOpacity
          style={{ width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, opacity: input.trim() ? 1 : 0.5 }}
          onPress={() => send(input)}
          disabled={!input.trim() || mutation.isPending}
        >
          <Ionicons name="send" size={16} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

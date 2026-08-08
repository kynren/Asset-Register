import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, FlatList, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { ShimmerList } from "../../components/Shimmer";

interface ChangelogEntry {
  id: number;
  title: string;
  summary: string | null;
  items: string[];
  publishedAt: string;
  createdBy: { id: number; firstName: string; lastName: string } | null;
}

const EMPTY_FORM = { title: "", summary: "", itemsText: "" };

// Mirrors client/src/pages/appSettings/ChangelogTab.tsx — publish "What's New" entries shown to
// every user the next time they load the app (see ChangelogModal web-side / equivalent unseen-entry
// check on mobile).
export function ChangelogScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data, isLoading } = useQuery({
    queryKey: ["mobile-changelog"],
    queryFn: async () => (await axiosClient.get("/changelog")).data as ChangelogEntry[],
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["mobile-changelog"] });
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function startEdit(entry: ChangelogEntry) {
    setEditingId(entry.id);
    setForm({ title: entry.title, summary: entry.summary ?? "", itemsText: entry.items.join("\n") });
    setShowForm(true);
  }

  function payload() {
    return {
      title: form.title.trim(),
      summary: form.summary.trim() || undefined,
      items: form.itemsText.split("\n").map((s) => s.trim()).filter(Boolean),
    };
  }

  const createMutation = useMutation({ mutationFn: () => axiosClient.post("/changelog", payload()), onSuccess: () => { invalidate(); closeForm(); } });
  const updateMutation = useMutation({ mutationFn: () => axiosClient.patch(`/changelog/${editingId}`, payload()), onSuccess: () => { invalidate(); closeForm(); } });
  const deleteMutation = useMutation({ mutationFn: (id: number) => axiosClient.delete(`/changelog/${id}`), onSuccess: invalidate });

  function confirmDelete(entry: ChangelogEntry) {
    Alert.alert("Delete entry", `Delete "${entry.title}"? It will no longer appear in anyone's What's New modal.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(entry.id) },
    ]);
  }

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface };

  if (isLoading) return <ShimmerList />;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
      data={data ?? []}
      keyExtractor={(item) => String(item.id)}
      ListHeaderComponent={
        hasPermission("app-settings", "create") ? (
          <View style={{ marginBottom: spacing.md }}>
            {!showForm ? (
              <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12 }} onPress={() => setShowForm(true)}>
                <Ionicons name="star-outline" size={16} color={colors.text} />
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>New Entry</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 8 }}>
                <TextInput style={inputStyle} placeholder="Title" placeholderTextColor={colors.textMuted} value={form.title} onChangeText={(v) => setForm((f) => ({ ...f, title: v }))} />
                <TextInput style={inputStyle} placeholder="Summary (one line)" placeholderTextColor={colors.textMuted} value={form.summary} onChangeText={(v) => setForm((f) => ({ ...f, summary: v }))} />
                <TextInput
                  style={[inputStyle, { height: 100, textAlignVertical: "top" }]}
                  placeholder={"Highlights, one per line"}
                  placeholderTextColor={colors.textMuted}
                  multiline
                  value={form.itemsText}
                  onChangeText={(v) => setForm((f) => ({ ...f, itemsText: v }))}
                />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: "center", paddingVertical: 10 }} onPress={closeForm}>
                    <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12.5 }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 10, opacity: form.title.trim() ? 1 : 0.5 }}
                    disabled={!form.title.trim() || createMutation.isPending || updateMutation.isPending}
                    onPress={() => (editingId ? updateMutation.mutate() : createMutation.mutate())}
                  >
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>{editingId ? "Save" : "Publish"}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        ) : null
      }
      ListEmptyComponent={!isLoading ? <Text style={{ color: colors.textMuted, textAlign: "center" }}>No changelog entries yet.</Text> : null}
      renderItem={({ item }) => (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: 6 }}>
          <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "700" }}>{item.title}</Text>
          {item.summary && <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{item.summary}</Text>}
          {item.items.map((line, i) => (
            <Text key={i} style={{ color: colors.text, fontSize: 12, marginTop: 4 }}>· {line}</Text>
          ))}
          <Text style={{ color: colors.textMuted, fontSize: 10.5, marginTop: 6 }}>
            {dayjs(item.publishedAt).format("D MMM YYYY")}{item.createdBy && ` · ${item.createdBy.firstName} ${item.createdBy.lastName}`}
          </Text>
          {(hasPermission("app-settings", "edit") || hasPermission("app-settings", "delete")) && (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
              {hasPermission("app-settings", "edit") && (
                <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => startEdit(item)}>
                  <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Edit</Text>
                </TouchableOpacity>
              )}
              {hasPermission("app-settings", "delete") && (
                <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => confirmDelete(item)}>
                  <Text style={{ color: colors.danger, fontSize: 11, fontWeight: "700" }}>Delete</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}
    />
  );
}

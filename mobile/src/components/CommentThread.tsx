import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../api/axiosClient";
import { useAuth } from "../auth/AuthContext";
import { useTheme } from "../theme/ThemeContext";

interface RecordCommentRow {
  id: number;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: { id: number; firstName: string; lastName: string };
}

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

// Generic comment/update thread — mirrors client/src/components/CommentThread.tsx. entityType must
// be in the backend's ALLOWED_ENTITY_TYPES allowlist (currently "Asset" and "StockItem").
export function CommentThread({ entityType, entityId }: { entityType: string; entityId: number }) {
  const { colors, spacing, radius } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const queryKey = ["mobile-record-comments", entityType, entityId];
  const { data: comments, isLoading } = useQuery<RecordCommentRow[]>({
    queryKey,
    queryFn: async () => (await axiosClient.get(`/comments/${entityType}/${entityId}`)).data,
  });

  const addMutation = useMutation({
    mutationFn: () => axiosClient.post(`/comments/${entityType}/${entityId}`, { body: draft }),
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const editMutation = useMutation({
    mutationFn: (id: number) => axiosClient.patch(`/comments/${id}`, { body: editDraft }),
    onSuccess: () => {
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/comments/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  function confirmDelete(id: number) {
    Alert.alert("Delete comment", "This comment will be permanently deleted.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(id) },
    ]);
  }

  return (
    <View>
      {isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : !comments || comments.length === 0 ? (
        <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>No comments yet.</Text>
      ) : (
        <View style={{ gap: 10 }}>
          {comments.map((c) => {
            const isOwn = c.author.id === user?.id;
            const isEditing = editingId === c.id;
            return (
              <View key={c.id} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary + "22", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700" }}>{initials(c.author.firstName, c.author.lastName)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <Text style={{ fontSize: 12.5, fontWeight: "700", color: colors.text, flex: 1 }}>
                      {c.author.firstName} {c.author.lastName}{" "}
                      <Text style={{ fontWeight: "400", color: colors.textMuted, fontSize: 11 }}>
                        {dayjs(c.createdAt).format("DD MMM YYYY HH:mm")}
                        {c.updatedAt !== c.createdAt ? " (edited)" : ""}
                      </Text>
                    </Text>
                    {isOwn && !isEditing && (
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <TouchableOpacity onPress={() => { setEditingId(c.id); setEditDraft(c.body); }}>
                          <Ionicons name="create-outline" size={15} color={colors.textMuted} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => confirmDelete(c.id)}>
                          <Ionicons name="trash-outline" size={15} color={colors.danger} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                  {isEditing ? (
                    <View style={{ marginTop: 6, gap: 6 }}>
                      <TextInput
                        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 8, color: colors.text, fontSize: 13 }}
                        value={editDraft}
                        onChangeText={setEditDraft}
                        multiline
                      />
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <TouchableOpacity
                          style={{ backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 6, opacity: editDraft.trim() ? 1 : 0.5 }}
                          disabled={!editDraft.trim() || editMutation.isPending}
                          onPress={() => editMutation.mutate(c.id)}
                        >
                          <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>Save</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={{ paddingHorizontal: 14, paddingVertical: 6 }} onPress={() => setEditingId(null)}>
                          <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700" }}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <Text style={{ color: colors.text, fontSize: 13, marginTop: 2 }}>{c.body}</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 10 }}>
        <TextInput
          style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, color: colors.text, fontSize: 13, maxHeight: 90 }}
          placeholder="Add a comment..."
          placeholderTextColor={colors.textMuted}
          value={draft}
          onChangeText={setDraft}
          multiline
        />
        <TouchableOpacity
          style={{ backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, opacity: draft.trim() ? 1 : 0.5 }}
          disabled={!draft.trim() || addMutation.isPending}
          onPress={() => addMutation.mutate()}
        >
          {addMutation.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>Post</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Alert, FlatList, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { ShimmerList } from "../../components/Shimmer";

interface AssetCollectionItem { id: number; name: string; description: string | null; categoryCount: number }

// Mirrors client/src/pages/assets/AssetCollectionsManageModal.tsx.
export function AssetCollectionsScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canCreate = hasPermission("admin", "create");
  const canEdit = hasPermission("admin", "edit");
  const canDelete = hasPermission("admin", "delete");

  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const { data: collections, isLoading } = useQuery({ queryKey: ["mobile-asset-collections"], queryFn: async () => (await axiosClient.get("/asset-collections")).data as AssetCollectionItem[] });

  function invalidate() { queryClient.invalidateQueries({ queryKey: ["mobile-asset-collections"] }); }

  const createMutation = useMutation({
    mutationFn: () => axiosClient.post("/asset-collections", { name: newName.trim(), description: newDescription || undefined }),
    onSuccess: () => { setNewName(""); setNewDescription(""); invalidate(); },
  });
  const renameMutation = useMutation({ mutationFn: (id: number) => axiosClient.patch(`/asset-collections/${id}`, { name: editName.trim() }), onSuccess: () => { setEditingId(null); invalidate(); } });
  const deleteMutation = useMutation({ mutationFn: (id: number) => axiosClient.delete(`/asset-collections/${id}`), onSuccess: invalidate });

  function confirmDelete(c: AssetCollectionItem) {
    Alert.alert("Delete Collection", `Delete "${c.name}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(c.id) },
    ]);
  }

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.bg };

  if (isLoading) return <ShimmerList />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={collections ?? []}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        ListHeaderComponent={
          canCreate ? (
            <View style={{ gap: 8, marginBottom: spacing.md }}>
              <TextInput style={inputStyle} placeholder="New Collection Name" placeholderTextColor={colors.textMuted} value={newName} onChangeText={setNewName} />
              <TextInput style={inputStyle} placeholder="Description (optional)" placeholderTextColor={colors.textMuted} value={newDescription} onChangeText={setNewDescription} />
              <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, opacity: newName.trim() ? 1 : 0.5 }} disabled={!newName.trim() || createMutation.isPending} onPress={() => createMutation.mutate()}>
                {createMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Add Collection</Text>}
              </TouchableOpacity>
            </View>
          ) : null
        }
        ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center" }}>No collections yet — add one above.</Text>}
        renderItem={({ item: c }) => (
          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
            {editingId === c.id ? (
              <TextInput style={[inputStyle, { flex: 1, marginRight: 8 }]} value={editName} onChangeText={setEditName} autoFocus />
            ) : (
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{c.name}</Text>
                {c.description && <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 2 }}>{c.description}</Text>}
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{c.categoryCount} {c.categoryCount === 1 ? "category" : "categories"}</Text>
              </View>
            )}
            {canEdit && (
              editingId === c.id ? (
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <TouchableOpacity disabled={!editName.trim() || renameMutation.isPending} onPress={() => renameMutation.mutate(c.id)}><Ionicons name="checkmark-circle-outline" size={22} color={colors.success} /></TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditingId(null)}><Ionicons name="close-circle-outline" size={22} color={colors.textMuted} /></TouchableOpacity>
                </View>
              ) : (
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TouchableOpacity onPress={() => { setEditingId(c.id); setEditName(c.name); }}><Ionicons name="pencil-outline" size={19} color={colors.text} /></TouchableOpacity>
                  {canDelete && (
                    <TouchableOpacity disabled={c.categoryCount > 0} onPress={() => confirmDelete(c)}>
                      <Ionicons name="trash-outline" size={19} color={c.categoryCount > 0 ? colors.border : colors.danger} />
                    </TouchableOpacity>
                  )}
                </View>
              )
            )}
          </View>
        )}
      />
    </View>
  );
}

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, FlatList, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { ShimmerList } from "../../components/Shimmer";

interface TeamMemberRow {
  id: number;
  userId: number;
  user: { id: number; firstName: string; lastName: string };
}
interface Team {
  id: number;
  name: string;
  members: TeamMemberRow[];
}
interface DirectoryUser {
  id: number;
  firstName: string;
  lastName: string;
}

// Mirrors client/src/pages/admin/TeamsTab.tsx — teams assignable as a group on Helpdesk tickets.
export function TeamListScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [name, setName] = useState("");
  const [userIds, setUserIds] = useState<Set<number>>(new Set());

  const { data: teams, isLoading } = useQuery({ queryKey: ["mobile-teams"], queryFn: async () => (await axiosClient.get("/teams")).data as Team[] });
  const { data: users } = useQuery({ queryKey: ["mobile-users-directory"], queryFn: async () => (await axiosClient.get("/users/directory")).data as DirectoryUser[] });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["mobile-teams"] });
  }

  function closeForm() {
    setShowForm(false);
    setEditingTeam(null);
    setName("");
    setUserIds(new Set());
  }

  function startEdit(team: Team) {
    setEditingTeam(team);
    setName(team.name);
    setUserIds(new Set(team.members.map((m) => m.userId)));
    setShowForm(true);
  }

  function toggleUser(id: number) {
    setUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), userIds: [...userIds] };
      return editingTeam ? axiosClient.patch(`/teams/${editingTeam.id}`, body) : axiosClient.post("/teams", body);
    },
    onSuccess: () => { invalidate(); closeForm(); },
  });

  const deleteMutation = useMutation({ mutationFn: (id: number) => axiosClient.delete(`/teams/${id}`), onSuccess: invalidate });

  function confirmDelete(team: Team) {
    Alert.alert("Delete team", `Delete "${team.name}"? Tickets currently assigned to this team keep their history but show no team once it's gone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(team.id) },
    ]);
  }

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface };

  if (isLoading) return <ShimmerList />;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
      data={teams ?? []}
      keyExtractor={(item) => String(item.id)}
      ListHeaderComponent={
        hasPermission("admin", "create") ? (
          <View style={{ marginBottom: spacing.md }}>
            {!showForm ? (
              <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12 }} onPress={() => setShowForm(true)}>
                <Ionicons name="add" size={16} color={colors.text} />
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>New Team</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 8 }}>
                <TextInput style={inputStyle} placeholder="Team name" placeholderTextColor={colors.textMuted} value={name} onChangeText={setName} />
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" }}>Members ({userIds.size} selected)</Text>
                <View style={{ maxHeight: 220 }}>
                  <FlatList
                    data={users ?? []}
                    keyExtractor={(u) => String(u.id)}
                    nestedScrollEnabled
                    renderItem={({ item: u }) => (
                      <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 }} onPress={() => toggleUser(u.id)}>
                        <Ionicons name={userIds.has(u.id) ? "checkbox" : "square-outline"} size={18} color={userIds.has(u.id) ? colors.primary : colors.textMuted} />
                        <Text style={{ color: colors.text, fontSize: 13 }}>{u.firstName} {u.lastName}</Text>
                      </TouchableOpacity>
                    )}
                    ListEmptyComponent={<Text style={{ color: colors.textMuted, fontSize: 12 }}>No users found.</Text>}
                  />
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: "center", paddingVertical: 10 }} onPress={closeForm}>
                    <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12.5 }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 10, opacity: name.trim() ? 1 : 0.5 }}
                    disabled={!name.trim() || saveMutation.isPending}
                    onPress={() => saveMutation.mutate()}
                  >
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>{editingTeam ? "Save" : "Create"}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        ) : null
      }
      ListEmptyComponent={!isLoading ? <Text style={{ color: colors.textMuted, textAlign: "center" }}>No teams yet.</Text> : null}
      renderItem={({ item }) => (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: 6 }}>
          <TouchableOpacity style={{ flexDirection: "row", alignItems: "center" }} onPress={() => setExpandedId(expandedId === item.id ? null : item.id)}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "700" }}>{item.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 2 }}>{item.members.length} member{item.members.length === 1 ? "" : "s"}</Text>
            </View>
            <Ionicons name={expandedId === item.id ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} />
          </TouchableOpacity>
          {expandedId === item.id && (
            <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
              {item.members.length === 0 && <Text style={{ color: colors.textMuted, fontSize: 12 }}>No members yet.</Text>}
              {item.members.map((m) => (
                <Text key={m.id} style={{ color: colors.text, fontSize: 12.5, paddingVertical: 3 }}>{m.user.firstName} {m.user.lastName}</Text>
              ))}
            </View>
          )}
          {(hasPermission("admin", "edit") || hasPermission("admin", "delete")) && (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
              {hasPermission("admin", "edit") && (
                <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => startEdit(item)}>
                  <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Edit</Text>
                </TouchableOpacity>
              )}
              {hasPermission("admin", "delete") && (
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

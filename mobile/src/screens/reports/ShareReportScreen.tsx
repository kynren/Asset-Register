import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute, RouteProp } from "@react-navigation/native";
import { Alert, FlatList, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { MoreStackParamList } from "../../navigation/types";

interface ShareRow {
  id: number;
  canEdit: boolean;
  userName: string | null;
  userEmail: string | null;
  teamName: string | null;
}

export function ShareReportScreen() {
  const { colors, spacing, radius } = useTheme();
  const route = useRoute<RouteProp<MoreStackParamList, "ShareReport">>();
  const queryClient = useQueryClient();
  const { id } = route.params;

  const [targetType, setTargetType] = useState<"user" | "team">("user");
  const [targetId, setTargetId] = useState<number | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: shares } = useQuery({
    queryKey: ["mobile-report-shares", id],
    queryFn: async () => (await axiosClient.get(`/reports/${id}/shares`)).data as ShareRow[],
  });
  const { data: users } = useQuery({ queryKey: ["mobile-users-directory"], queryFn: async () => (await axiosClient.get("/users/directory")).data });
  const { data: teams } = useQuery({ queryKey: ["mobile-teams"], queryFn: async () => (await axiosClient.get("/teams")).data });

  const shareMutation = useMutation({
    mutationFn: () => axiosClient.post(`/reports/${id}/shares`, { [targetType === "user" ? "userId" : "teamId"]: targetId, canEdit }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-report-shares", id] });
      setTargetId(null);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (shareId: number) => axiosClient.delete(`/reports/${id}/shares/${shareId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-report-shares", id] }),
  });

  function confirmRemove(share: ShareRow) {
    Alert.alert("Remove share", `Stop sharing this report with ${share.userName ?? `Team: ${share.teamName}`}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => removeMutation.mutate(share.id) },
    ]);
  }

  const targetOptions: PickerOption[] =
    targetType === "user"
      ? (users ?? []).map((u: any) => ({ id: u.id, label: `${u.firstName} ${u.lastName}` }))
      : (teams ?? []).map((t: any) => ({ id: t.id, label: t.name }));
  const targetLabel = targetOptions.find((o) => o.id === targetId)?.label ?? "Select...";

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg }}
      data={shares ?? []}
      keyExtractor={(item) => String(item.id)}
      ListHeaderComponent={
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginBottom: 8 }}>Share With</Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
            {(["user", "team"] as const).map((t) => (
              <TouchableOpacity
                key={t}
                style={{ borderWidth: 1, borderColor: targetType === t ? colors.primary : colors.border, backgroundColor: targetType === t ? colors.primary + "22" : colors.bg, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 }}
                onPress={() => { setTargetType(t); setTargetId(null); }}
              >
                <Text style={{ color: targetType === t ? colors.primary : colors.text, fontSize: 12.5, fontWeight: "600" }}>{t === "user" ? "A User" : "A Team"}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}
            onPress={() => setPickerOpen(true)}
          >
            <Text style={{ color: targetId != null ? colors.text : colors.textMuted, fontSize: 14 }}>{targetLabel}</Text>
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }} onPress={() => setCanEdit((v) => !v)}>
            <Ionicons name={canEdit ? "checkbox" : "square-outline"} size={20} color={canEdit ? colors.primary : colors.textMuted} />
            <Text style={{ color: colors.text, fontSize: 12.5, flex: 1 }}>Allow editing (change filters, columns, visualization)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, opacity: targetId != null ? 1 : 0.5 }}
            disabled={targetId == null || shareMutation.isPending}
            onPress={() => shareMutation.mutate()}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Share</Text>
          </TouchableOpacity>

          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginTop: 18, marginBottom: 4 }}>Currently Shared With</Text>
        </View>
      }
      ListEmptyComponent={<Text style={{ color: colors.textMuted, fontSize: 13, paddingHorizontal: 4 }}>Not shared with anyone yet.</Text>}
      renderItem={({ item }) => (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ color: colors.text, fontSize: 13 }}>{item.userName ?? `Team: ${item.teamName}`}</Text>
            <View style={{ backgroundColor: colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: "700" }}>{item.canEdit ? "Can edit" : "View only"}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => confirmRemove(item)} style={{ padding: 4 }}>
            <Ionicons name="close" size={16} color={colors.danger} />
          </TouchableOpacity>
        </View>
      )}
      ListFooterComponent={
        <PickerModal visible={pickerOpen} title="Select" options={targetOptions} selectedId={targetId} searchable onSelect={(v) => setTargetId(v == null ? null : Number(v))} onClose={() => setPickerOpen(false)} />
      }
    />
  );
}

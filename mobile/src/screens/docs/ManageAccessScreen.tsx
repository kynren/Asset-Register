import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute, RouteProp } from "@react-navigation/native";
import { Alert, FlatList, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { ShimmerList } from "../../components/Shimmer";
import { AccessGrant, AccessLevel, LEVEL_LABELS, grantLabel } from "../../lib/accessControl";
import { MoreStackParamList } from "../../navigation/types";

interface DirectoryUser {
  id: number;
  firstName: string;
  lastName: string;
}
interface DirectoryTeam {
  id: number;
  name: string;
}

// Mirrors client/src/components/AccessControl.tsx's ManageAccessModal — generic over any record
// built on the recordAccess system, driven by apiBasePath (route param) the same way.
export function ManageAccessScreen() {
  const { colors, spacing, radius } = useTheme();
  const route = useRoute<RouteProp<MoreStackParamList, "ManageAccess">>();
  const queryClient = useQueryClient();
  const { apiBasePath, queryKeyToInvalidate, title } = route.params;

  const [targetType, setTargetType] = useState<"user" | "team">("user");
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickedLevel, setPickedLevel] = useState<AccessLevel>("EDIT");

  const { data: access, isLoading } = useQuery({
    queryKey: ["mobile-access", apiBasePath],
    queryFn: async () => (await axiosClient.get(apiBasePath)).data.access as AccessGrant[],
  });
  const { data: users } = useQuery({ queryKey: ["mobile-users-directory"], queryFn: async () => (await axiosClient.get("/users/directory")).data as DirectoryUser[] });
  const { data: teams } = useQuery({ queryKey: ["mobile-teams-directory"], queryFn: async () => (await axiosClient.get("/teams/directory")).data as DirectoryTeam[] });

  const addMutation = useMutation({
    mutationFn: () => axiosClient.post(`${apiBasePath}/access`, targetType === "user" ? { userId: pickedId, level: pickedLevel } : { teamId: pickedId, level: pickedLevel }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-access", apiBasePath] });
      if (queryKeyToInvalidate) queryClient.invalidateQueries({ queryKey: [queryKeyToInvalidate] });
      setPickedId(null);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (params: { kind: "user" | "team"; targetId: number; level: AccessLevel }) =>
      axiosClient.delete(`${apiBasePath}/access/${params.kind}/${params.targetId}/${params.level}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-access", apiBasePath] });
      if (queryKeyToInvalidate) queryClient.invalidateQueries({ queryKey: [queryKeyToInvalidate] });
    },
  });

  const targetOptions: PickerOption[] = targetType === "user" ? (users ?? []).map((u) => ({ id: u.id, label: `${u.firstName} ${u.lastName}` })) : (teams ?? []).map((t) => ({ id: t.id, label: t.name }));
  const targetLabel = targetOptions.find((o) => o.id === pickedId)?.label ?? "Select...";
  const pickerStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const, backgroundColor: colors.surface };

  function confirmRemove(item: AccessGrant) {
    Alert.alert("Remove access", `Revoke access for ${grantLabel(item)}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => removeMutation.mutate({ kind: item.teamId != null ? "team" : "user", targetId: (item.teamId ?? item.userId)!, level: item.level }) },
    ]);
  }

  if (isLoading) return <ShimmerList />;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg }}
      data={access ?? []}
      keyExtractor={(item) => `${item.userId ?? item.teamId}-${item.level}`}
      ListHeaderComponent={
        <View style={{ marginBottom: spacing.md }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.md }}>
            Only people and teams granted access here (plus the creator) can edit or delete{title ? ` "${title}"` : " this"}. A team grant applies to everyone currently on that team.
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
            {(["user", "team"] as const).map((t) => (
              <TouchableOpacity
                key={t}
                style={{ borderWidth: 1, borderColor: targetType === t ? colors.primary : colors.border, backgroundColor: targetType === t ? colors.primary + "22" : colors.surface, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 }}
                onPress={() => { setTargetType(t); setPickedId(null); }}
              >
                <Text style={{ color: targetType === t ? colors.primary : colors.text, fontSize: 12.5, fontWeight: "600" }}>{t === "user" ? "A User" : "A Team"}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={pickerStyle} onPress={() => setPickerOpen(true)}>
            <Text style={{ color: pickedId != null ? colors.text : colors.textMuted }}>{targetLabel}</Text>
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          </TouchableOpacity>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            {(["EDIT", "DELETE"] as AccessLevel[]).map((lvl) => (
              <TouchableOpacity
                key={lvl}
                style={{ borderWidth: 1, borderColor: pickedLevel === lvl ? colors.primary : colors.border, backgroundColor: pickedLevel === lvl ? colors.primary + "22" : colors.surface, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 }}
                onPress={() => setPickedLevel(lvl)}
              >
                <Text style={{ color: pickedLevel === lvl ? colors.primary : colors.text, fontSize: 11.5, fontWeight: "700" }}>{LEVEL_LABELS[lvl]}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={{ flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", justifyContent: "center", opacity: pickedId != null ? 1 : 0.5 }}
              disabled={pickedId == null || addMutation.isPending}
              onPress={() => addMutation.mutate()}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Grant</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginTop: 18, marginBottom: 4 }}>Currently Shared With</Text>
        </View>
      }
      ListEmptyComponent={!isLoading ? <Text style={{ color: colors.textMuted, fontSize: 13 }}>No one else has access yet.</Text> : null}
      renderItem={({ item }) => (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text style={{ color: colors.text, fontSize: 13 }}>
            {grantLabel(item)} <Text style={{ color: colors.textMuted, fontSize: 11.5 }}>({LEVEL_LABELS[item.level]})</Text>
          </Text>
          <TouchableOpacity onPress={() => confirmRemove(item)}>
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
          </TouchableOpacity>
        </View>
      )}
      ListFooterComponent={<PickerModal visible={pickerOpen} title="Select" options={targetOptions} selectedId={pickedId} searchable onSelect={(v) => setPickedId(v == null ? null : Number(v))} onClose={() => setPickerOpen(false)} />}
    />
  );
}

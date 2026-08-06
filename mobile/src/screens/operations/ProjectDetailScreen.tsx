import { useLayoutEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useAuth } from "../../auth/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { ShimmerDetail } from "../../components/Shimmer";
import { PROJECT_STATUS_OPTIONS, ProjectCard, ProjectStatus } from "../../types/operations";
import { MoreStackParamList } from "../../navigation/types";

export function ProjectDetailScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const route = useRoute<RouteProp<MoreStackParamList, "ProjectDetail">>();
  const { id } = route.params;
  const queryClient = useQueryClient();
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);

  const { data: cards, isLoading } = useQuery({
    queryKey: ["mobile-projects"],
    queryFn: async () => (await axiosClient.get("/operations/projects")).data as ProjectCard[],
  });
  const card = cards?.find((c) => c.id === id);

  const statusMutation = useMutation({
    mutationFn: (status: ProjectStatus) => axiosClient.patch(`/operations/projects/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-projects"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => axiosClient.delete(`/operations/projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-projects"] });
      navigation.goBack();
    },
  });

  function confirmDelete() {
    Alert.alert("Delete project", `Delete "${card?.title}"? This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate() },
    ]);
  }

  useLayoutEffect(() => {
    navigation.setOptions({ title: card?.title ?? "Project" });
  }, [navigation, card]);

  if (isLoading || !card) {
    return <ShimmerDetail />;
  }

  const canEdit = hasPermission("operations", "edit");
  const statusOptions: PickerOption[] = PROJECT_STATUS_OPTIONS.map((o) => ({ id: o.value, label: o.label }));
  const statusLabel = PROJECT_STATUS_OPTIONS.find((o) => o.value === card.status)?.label ?? card.status;

  const rows: [string, string | null][] = [
    ["Assignee", card.assignee ? `${card.assignee.firstName} ${card.assignee.lastName}` : "Unassigned"],
    ["Created by", `${card.createdBy.firstName} ${card.createdBy.lastName}`],
    ["Start date", card.startDate ? dayjs(card.startDate).format("DD MMM YYYY") : null],
    ["Due date", card.dueDate ? dayjs(card.dueDate).format("DD MMM YYYY") : null],
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      {card.description && (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.lg }}>
          <Text style={{ color: colors.text, fontSize: 13, lineHeight: 19 }}>{card.description}</Text>
        </View>
      )}

      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 6, textTransform: "uppercase" }}>Status</Text>
      <TouchableOpacity
        disabled={!canEdit}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surface, marginBottom: spacing.lg }}
        onPress={() => setStatusPickerOpen(true)}
      >
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>{statusMutation.isPending ? "Updating…" : statusLabel}</Text>
        {canEdit && <Ionicons name="chevron-down" size={16} color={colors.textMuted} />}
      </TouchableOpacity>

      <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg }}>
        {rows
          .filter(([, v]) => v !== null)
          .map(([label, value], i, arr) => (
            <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{label}</Text>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{value}</Text>
            </View>
          ))}
      </View>

      {hasPermission("operations", "delete") && (
        <TouchableOpacity
          style={{ marginTop: spacing.xl, borderWidth: 1.5, borderColor: colors.danger, borderRadius: radius.md, alignItems: "center", paddingVertical: 14 }}
          onPress={confirmDelete}
          disabled={deleteMutation.isPending}
        >
          <Text style={{ color: colors.danger, fontWeight: "700" }}>Delete project</Text>
        </TouchableOpacity>
      )}

      <PickerModal
        visible={statusPickerOpen}
        title="Status"
        options={statusOptions}
        selectedId={card.status}
        onSelect={(v) => statusMutation.mutate(v as ProjectStatus)}
        onClose={() => setStatusPickerOpen(false)}
      />
    </ScrollView>
  );
}

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { FlatList, RefreshControl, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useAuth } from "../../auth/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { ShimmerList } from "../../components/Shimmer";
import { PROJECT_STATUS_OPTIONS, ProjectCard, ProjectStatus } from "../../types/operations";
import { MoreStackParamList } from "../../navigation/types";

type Tone = "primary" | "warning" | "success" | "textMuted";
const STATUS_TONE: Record<ProjectStatus, Tone> = {
  TODO: "textMuted",
  IN_PROGRESS: "primary",
  REVIEW: "warning",
  DONE: "success",
};

// The web app's IT Projects tab is a drag-and-drop Kanban board — dragging cards between columns
// doesn't translate well to touch, so this is a flat list groupable by status filter chip instead,
// same simplification as the Network module's graph-to-list swap.
export function ProjectListScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();

  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "ALL">("ALL");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["mobile-projects"],
    queryFn: async () => (await axiosClient.get("/operations/projects")).data as ProjectCard[],
  });

  const cards = data ?? [];
  const filtered = useMemo(() => (statusFilter === "ALL" ? cards : cards.filter((c) => c.status === statusFilter)), [cards, statusFilter]);
  const canCreate = hasPermission("operations", "create");

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={["ALL", ...PROJECT_STATUS_OPTIONS.map((o) => o.value)] as (ProjectStatus | "ALL")[]}
          keyExtractor={(s) => s}
          contentContainerStyle={{ gap: spacing.sm }}
          renderItem={({ item: s }) => {
            const label = s === "ALL" ? "All" : PROJECT_STATUS_OPTIONS.find((o) => o.value === s)!.label;
            const active = statusFilter === s;
            return (
              <TouchableOpacity
                onPress={() => setStatusFilter(s)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: radius.pill,
                  backgroundColor: active ? colors.primary : colors.surface,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                }}
              >
                <Text style={{ color: active ? "#fff" : colors.text, fontSize: 12.5, fontWeight: "600" }}>{label}</Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {isLoading ? (
        <ShimmerList />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 40 }}>No projects found.</Text>}
          renderItem={({ item }) => {
            const tone: Tone = STATUS_TONE[item.status];
            const toneColors: Record<Tone, string> = { primary: colors.primary, warning: colors.warning, success: colors.success, textMuted: colors.textMuted };
            const color = toneColors[tone];
            return (
              <TouchableOpacity
                style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}
                onPress={() => navigation.navigate("ProjectDetail", { id: item.id })}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{item.title}</Text>
                    {item.assignee && (
                      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                        {item.assignee.firstName} {item.assignee.lastName}
                      </Text>
                    )}
                  </View>
                  <View style={{ backgroundColor: color + "22", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
                    <Text style={{ color, fontSize: 11, fontWeight: "700" }}>{PROJECT_STATUS_OPTIONS.find((o) => o.value === item.status)?.label}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {canCreate && (
        <TouchableOpacity
          style={{ position: "absolute", right: 20, bottom: 20, width: 56, height: 56, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.primary, elevation: 4, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } }}
          onPress={() => navigation.navigate("ProjectForm", undefined)}
        >
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

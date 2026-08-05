import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Alert, FlatList, RefreshControl, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs, { Dayjs } from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { MoreStackParamList } from "../../navigation/types";

export interface Schedule {
  id: number;
  resourceName: string;
  role: string | null;
  groupLabel: string;
  title: string | null;
  color: string | null;
  startAt: string;
  endAt: string;
  notes: string | null;
}

// Mirrors client/src/pages/operations/tabs/ResourceSchedulingTab.tsx's data, shown here as a plain
// day list rather than the web app's drag-and-drop grid — dnd-kit is a web-only dependency and this
// module doesn't need it to be useful: scan today's blocks, add one, edit or remove it.
export function ResourceSchedulingScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<Dayjs>(() => dayjs().startOf("day"));

  const { data: schedules, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["mobile-scheduling"],
    queryFn: async () => (await axiosClient.get("/operations/scheduling")).data as Schedule[],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/operations/scheduling/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-scheduling"] }),
  });

  function confirmDelete(s: Schedule) {
    Alert.alert("Remove schedule block", `Remove "${s.title || s.resourceName}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => deleteMutation.mutate(s.id) },
    ]);
  }

  const dayBlocks = useMemo(
    () => (schedules ?? []).filter((s) => dayjs(s.startAt).isSame(selectedDate, "day")).sort((a, b) => dayjs(a.startAt).diff(dayjs(b.startAt))),
    [schedules, selectedDate]
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, paddingBottom: spacing.sm }}>
        <TouchableOpacity onPress={() => setSelectedDate((d) => d.subtract(1, "day"))} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{selectedDate.format("DD MMM YYYY")}</Text>
        <TouchableOpacity onPress={() => setSelectedDate((d) => d.add(1, "day"))} style={{ padding: 6 }}>
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      <FlatList
        contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.sm }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
        data={dayBlocks}
        keyExtractor={(item) => String(item.id)}
        ListEmptyComponent={!isLoading ? <Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 24 }}>Nothing scheduled for this day.</Text> : null}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={{ flexDirection: "row", backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4, borderLeftColor: item.color ?? colors.primary, padding: spacing.md, marginBottom: 6 }}
            onPress={() => navigation.navigate("ScheduleBlockForm", { id: item.id })}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>{item.title || "Shift"}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 2 }}>
                {item.resourceName}{item.role ? ` · ${item.role}` : ""} · {dayjs(item.startAt).format("HH:mm")}–{dayjs(item.endAt).format("HH:mm")}
              </Text>
            </View>
            <TouchableOpacity onPress={() => confirmDelete(item)} style={{ padding: 4 }}>
              <Ionicons name="trash-outline" size={16} color={colors.danger} />
            </TouchableOpacity>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity
        style={{ position: "absolute", right: spacing.lg, bottom: spacing.lg, backgroundColor: colors.primary, borderRadius: 28, width: 56, height: 56, alignItems: "center", justifyContent: "center", elevation: 4 }}
        onPress={() => navigation.navigate("ScheduleBlockForm", { defaultDate: selectedDate.format("YYYY-MM-DD") })}
      >
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

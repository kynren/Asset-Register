import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { KeyboardAvoidingScreen } from "../../components/KeyboardAvoidingScreen";
import { MoreStackParamList } from "../../navigation/types";
import { Schedule } from "./ResourceSchedulingScreen";

const TIME_SLOTS = [
  { startHour: 8, endHour: 10 },
  { startHour: 10, endHour: 12 },
  { startHour: 12, endHour: 14 },
  { startHour: 14, endHour: 16 },
  { startHour: 16, endHour: 18 },
  { startHour: 18, endHour: 20 },
];
function slotLabel(s: { startHour: number; endHour: number }) {
  const fmt = (h: number) => `${String(h).padStart(2, "0")}:00`;
  return `${fmt(s.startHour)} - ${fmt(s.endHour)}`;
}

export function ScheduleBlockFormScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<MoreStackParamList, "ScheduleBlockForm">>();
  const queryClient = useQueryClient();
  const editingId = route.params?.id;

  const { data: existing } = useQuery({
    queryKey: ["mobile-scheduling"],
    queryFn: async () => (await axiosClient.get("/operations/scheduling")).data as Schedule[],
    enabled: Boolean(editingId),
    select: (data) => data.find((s) => s.id === editingId),
  });

  const [resourceName, setResourceName] = useState(existing?.resourceName ?? "");
  const [role, setRole] = useState(existing?.role ?? "");
  const [groupLabel, setGroupLabel] = useState(existing?.groupLabel ?? "Technicians & Crews");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [date, setDate] = useState(existing ? dayjs(existing.startAt).format("YYYY-MM-DD") : route.params?.defaultDate ?? dayjs().format("YYYY-MM-DD"));
  const [slotIndex, setSlotIndex] = useState(() => {
    if (!existing) return 0;
    const hour = dayjs(existing.startAt).hour();
    const idx = TIME_SLOTS.findIndex((s) => hour >= s.startHour && hour < s.endHour);
    return idx === -1 ? 0 : idx;
  });
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const slot = TIME_SLOTS[slotIndex];
  const valid = resourceName.trim().length > 0 && title.trim().length > 0;

  function buildPayload() {
    const startAt = dayjs(date).hour(slot.startHour).minute(0).second(0);
    const endAt = dayjs(date).hour(slot.endHour).minute(0).second(0);
    return {
      resourceName: resourceName.trim(),
      role: role.trim() || undefined,
      groupLabel,
      title: title.trim(),
      notes: notes.trim() || undefined,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
    };
  }

  const mutation = useMutation({
    mutationFn: () => (editingId ? axiosClient.patch(`/operations/scheduling/${editingId}`, buildPayload()) : axiosClient.post("/operations/scheduling", buildPayload())),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-scheduling"] });
      navigation.goBack();
    },
    onError: (err: any) => setError(err?.response?.data?.error ?? "Could not save schedule block."),
  });

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface, marginBottom: 14 };
  const labelStyle = { color: colors.textMuted, fontSize: 12, fontWeight: "700" as const, marginBottom: 6, textTransform: "uppercase" as const };

  return (
    <KeyboardAvoidingScreen>
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      {error && (
        <View style={{ backgroundColor: colors.danger + "22", borderRadius: radius.md, padding: 12, marginBottom: spacing.md }}>
          <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text>
        </View>
      )}

      <Text style={labelStyle}>Resource / Crew *</Text>
      <TextInput style={inputStyle} placeholder="e.g. Alice Smith" placeholderTextColor={colors.textMuted} value={resourceName} onChangeText={setResourceName} />

      <Text style={labelStyle}>Role</Text>
      <TextInput style={inputStyle} placeholder="e.g. Lead Stage Tech" placeholderTextColor={colors.textMuted} value={role} onChangeText={setRole} />

      <Text style={labelStyle}>Group</Text>
      <TextInput style={inputStyle} value={groupLabel} onChangeText={setGroupLabel} />

      <Text style={labelStyle}>Block Title *</Text>
      <TextInput style={inputStyle} placeholder="e.g. Lake Projector Calibration" placeholderTextColor={colors.textMuted} value={title} onChangeText={setTitle} />

      <Text style={labelStyle}>Date (YYYY-MM-DD)</Text>
      <TextInput style={inputStyle} value={date} onChangeText={setDate} />

      <Text style={labelStyle}>Time Slot</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {TIME_SLOTS.map((s, i) => (
          <TouchableOpacity
            key={s.startHour}
            style={{ borderWidth: 1, borderColor: i === slotIndex ? colors.primary : colors.border, backgroundColor: i === slotIndex ? colors.primary + "22" : colors.surface, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 }}
            onPress={() => setSlotIndex(i)}
          >
            <Text style={{ color: i === slotIndex ? colors.primary : colors.text, fontSize: 12.5, fontWeight: "600" }}>{slotLabel(s)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={labelStyle}>Notes</Text>
      <TextInput style={inputStyle} placeholder="Optional" placeholderTextColor={colors.textMuted} value={notes} onChangeText={setNotes} />

      <TouchableOpacity
        style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 15, marginTop: spacing.md, opacity: valid ? 1 : 0.6 }}
        disabled={!valid || mutation.isPending}
        onPress={() => mutation.mutate()}
      >
        {mutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>{editingId ? "Save changes" : "Schedule block"}</Text>}
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAvoidingScreen>
  );
}

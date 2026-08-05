import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { StatusPill } from "../../components/StatusPill";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { TicketTask, TicketUserRef } from "../../types/ticket";

function formatDuration(totalSeconds: number | null) {
  if (!totalSeconds) return null;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

// Mobile port of client/src/pages/helpdesk/TicketTasksTab.tsx — task log + time tracking.
export function TicketTasksTab({ ticketId, tasks, users, currentUserId, canEdit }: { ticketId: number; tasks: TicketTask[]; users: TicketUserRef[]; currentUserId: number; canEdit: boolean }) {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [minutes, setMinutes] = useState("");
  const [assignedToId, setAssignedToId] = useState<number | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["mobile-ticket", ticketId] });

  const createMutation = useMutation({
    mutationFn: () =>
      axiosClient.post(`/tickets/${ticketId}/tasks`, {
        content,
        category: category || undefined,
        actionTimeSeconds: minutes ? Number(minutes) * 60 : undefined,
        assignedToId: assignedToId ?? undefined,
        isPrivate,
      }),
    onSuccess: () => {
      invalidate();
      setContent("");
      setCategory("");
      setMinutes("");
      setAssignedToId(null);
      setIsPrivate(false);
    },
  });

  const toggleStateMutation = useMutation({
    mutationFn: ({ taskId, state }: { taskId: number; state: string }) => axiosClient.patch(`/tickets/${ticketId}/tasks/${taskId}`, { state }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (taskId: number) => axiosClient.delete(`/tickets/${ticketId}/tasks/${taskId}`),
    onSuccess: invalidate,
  });

  function confirmDelete(task: TicketTask) {
    Alert.alert("Delete task", "Are you sure you want to delete this task? This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(task.id) },
    ]);
  }

  const visibleTasks = (tasks ?? []).filter((t) => !t.isPrivate || t.authorId === currentUserId);
  const userOptions: PickerOption[] = users.map((u) => ({ id: u.id, label: `${u.firstName} ${u.lastName}` }));
  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: colors.text, backgroundColor: colors.bg };

  return (
    <View>
      {visibleTasks.length === 0 && <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>No tasks logged yet.</Text>}
      {visibleTasks.map((t) => (
        <View key={t.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <StatusPill value={t.state} />
            {t.category && <Text style={{ color: colors.textMuted, fontSize: 11 }}>{t.category}</Text>}
            {t.isPrivate && <Ionicons name="eye-off-outline" size={11} color={colors.textMuted} />}
            <Text style={{ color: colors.textMuted, fontSize: 10.5 }}>{dayjs(t.createdAt).format("DD MMM HH:mm")}</Text>
          </View>
          <Text style={{ color: colors.text, fontSize: 13, marginTop: 4 }}>{t.content}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
            {t.author && `${t.author.firstName} ${t.author.lastName}`}
            {t.assignedTo && ` · Assigned to ${t.assignedTo.firstName} ${t.assignedTo.lastName}`}
            {formatDuration(t.actionTimeSeconds) && ` · ${formatDuration(t.actionTimeSeconds)}`}
          </Text>
          {canEdit && (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 5 }} onPress={() => toggleStateMutation.mutate({ taskId: t.id, state: t.state === "DONE" ? "TODO" : "DONE" })}>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>{t.state === "DONE" ? "Reopen" : "Mark Done"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.danger }} onPress={() => confirmDelete(t)}>
                <Ionicons name="trash-outline" size={13} color={colors.danger} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      ))}

      {canEdit && (
        <View style={{ marginTop: spacing.md, gap: 8 }}>
          <TextInput style={[inputStyle, { minHeight: 60, textAlignVertical: "top" }]} multiline placeholder="Describe the work done or planned..." placeholderTextColor={colors.textMuted} value={content} onChangeText={setContent} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput style={[inputStyle, { flex: 1 }]} placeholder="Category" placeholderTextColor={colors.textMuted} value={category} onChangeText={setCategory} />
            <TextInput style={[inputStyle, { width: 100 }]} placeholder="Minutes" placeholderTextColor={colors.textMuted} keyboardType="number-pad" value={minutes} onChangeText={setMinutes} />
          </View>
          <TouchableOpacity style={inputStyle} onPress={() => setPickerOpen(true)}>
            <Text style={{ color: assignedToId ? colors.text : colors.textMuted, fontSize: 13 }}>
              {assignedToId ? userOptions.find((u) => u.id === assignedToId)?.label : "Assign to..."}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 8 }} onPress={() => setIsPrivate((v) => !v)}>
            <Ionicons name={isPrivate ? "checkbox" : "square-outline"} size={18} color={isPrivate ? colors.primary : colors.textMuted} />
            <Text style={{ color: colors.text, fontSize: 12 }}>Private (staff only)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 11, opacity: content.trim() ? 1 : 0.6 }}
            disabled={!content.trim() || createMutation.isPending}
            onPress={() => createMutation.mutate()}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>Log Task</Text>
          </TouchableOpacity>
        </View>
      )}

      <PickerModal visible={pickerOpen} title="Assign to" options={userOptions} selectedId={assignedToId} allowClear onSelect={(v) => setAssignedToId(v as number | null)} onClose={() => setPickerOpen(false)} />
    </View>
  );
}

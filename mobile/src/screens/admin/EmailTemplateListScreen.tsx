import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, FlatList, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { ShimmerList } from "../../components/Shimmer";
import { EmailEventType, EVENT_DESCRIPTIONS, EVENT_LABELS, EVENT_TYPES } from "../../lib/emailTemplateConstants";

interface EmailTemplate {
  id: number;
  name: string;
  eventType: EmailEventType;
  subject: string;
  isActive: boolean;
  updatedAt: string;
}

// Mirrors client/src/pages/admin/EmailTemplatesTab.tsx's list + lifecycle actions (create,
// activate/deactivate, duplicate, delete, send test). The drag-and-drop block body designer
// (EmailTemplateBuilderModal, dnd-kit) stays web-only — mobile edits name/subject only, same
// simplification already applied to Resource Scheduling's drag grid.
export function EmailTemplateListScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [eventFilter, setEventFilter] = useState<EmailEventType | "">("");
  const [filterPickerOpen, setFilterPickerOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [eventType, setEventType] = useState<EmailEventType>("ACCOUNT_CREATED");
  const [eventPickerOpen, setEventPickerOpen] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testEmail, setTestEmail] = useState("");

  const { data: templates, isLoading } = useQuery({
    queryKey: ["mobile-email-templates", eventFilter],
    queryFn: async () => (await axiosClient.get("/email-templates", { params: eventFilter ? { eventType: eventFilter } : undefined })).data as EmailTemplate[],
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["mobile-email-templates"] });
  }
  const activateMutation = useMutation({ mutationFn: (id: number) => axiosClient.patch(`/email-templates/${id}/activate`), onSuccess: invalidate });
  const deactivateMutation = useMutation({ mutationFn: (id: number) => axiosClient.patch(`/email-templates/${id}/deactivate`), onSuccess: invalidate });
  const duplicateMutation = useMutation({ mutationFn: (id: number) => axiosClient.post(`/email-templates/${id}/duplicate`), onSuccess: invalidate });
  const deleteMutation = useMutation({ mutationFn: (id: number) => axiosClient.delete(`/email-templates/${id}`), onSuccess: invalidate });
  const testMutation = useMutation({
    mutationFn: () => axiosClient.post(`/email-templates/${testingId}/test`, { to: testEmail }),
    onSuccess: () => {
      setTestingId(null);
      setTestEmail("");
      Alert.alert("Test email sent");
    },
  });
  const createMutation = useMutation({
    mutationFn: async () => (await axiosClient.post("/email-templates", { name: name.trim(), eventType, subject: subject.trim(), blocks: [] })).data as EmailTemplate,
    onSuccess: () => {
      invalidate();
      setShowCreate(false);
      setName("");
      setSubject("");
    },
  });

  function confirmDelete(t: EmailTemplate) {
    Alert.alert("Delete template", `Delete "${t.name}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(t.id) },
    ]);
  }

  const eventOptions: PickerOption[] = EVENT_TYPES.map((e) => ({ id: e, label: EVENT_LABELS[e] }));
  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface };
  const pickerStyle = { ...inputStyle, flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const };

  if (isLoading) return <ShimmerList />;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
      data={templates ?? []}
      keyExtractor={(item) => String(item.id)}
      ListHeaderComponent={
        <View style={{ marginBottom: spacing.md }}>
          <TouchableOpacity style={[pickerStyle, { marginBottom: spacing.sm }]} onPress={() => setFilterPickerOpen(true)}>
            <Text style={{ color: colors.text }}>{eventFilter ? EVENT_LABELS[eventFilter] : "All Events"}</Text>
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          </TouchableOpacity>

          {hasPermission("admin", "create") && (
            !showCreate ? (
              <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12 }} onPress={() => setShowCreate(true)}>
                <Ionicons name="add" size={16} color={colors.text} />
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>New Template</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 8 }}>
                <TextInput style={inputStyle} placeholder="Template name" placeholderTextColor={colors.textMuted} value={name} onChangeText={setName} />
                <TouchableOpacity style={pickerStyle} onPress={() => setEventPickerOpen(true)}>
                  <Text style={{ color: colors.text }}>{EVENT_LABELS[eventType]}</Text>
                  <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                </TouchableOpacity>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{EVENT_DESCRIPTIONS[eventType]}</Text>
                <TextInput style={inputStyle} placeholder="Subject line" placeholderTextColor={colors.textMuted} value={subject} onChangeText={setSubject} />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: "center", paddingVertical: 10 }} onPress={() => setShowCreate(false)}>
                    <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12.5 }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 10, opacity: name.trim() && subject.trim() ? 1 : 0.5 }}
                    disabled={!name.trim() || !subject.trim() || createMutation.isPending}
                    onPress={() => createMutation.mutate()}
                  >
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>Create</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )
          )}
        </View>
      }
      ListEmptyComponent={!isLoading ? <Text style={{ color: colors.textMuted, textAlign: "center" }}>No email templates yet — a built-in email is used until you create and activate one.</Text> : null}
      renderItem={({ item }) => (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: 6 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "700" }}>{item.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 2 }}>{EVENT_LABELS[item.eventType]} · {item.subject}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 10.5, marginTop: 2 }}>Updated {dayjs(item.updatedAt).format("DD MMM YYYY")}</Text>
            </View>
            <View style={{ backgroundColor: item.isActive ? colors.success + "22" : colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ color: item.isActive ? colors.success : colors.textMuted, fontSize: 10.5, fontWeight: "700" }}>{item.isActive ? "Active" : "Inactive"}</Text>
            </View>
          </View>
          {hasPermission("admin", "edit") && (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => (item.isActive ? deactivateMutation.mutate(item.id) : activateMutation.mutate(item.id))}>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>{item.isActive ? "Deactivate" : "Activate"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => setTestingId(testingId === item.id ? null : item.id)}>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Send Test</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => duplicateMutation.mutate(item.id)}>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Duplicate</Text>
              </TouchableOpacity>
              {hasPermission("admin", "delete") && (
                <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => confirmDelete(item)}>
                  <Text style={{ color: colors.danger, fontSize: 11, fontWeight: "700" }}>Delete</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          {testingId === item.id && (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
              <TextInput style={[inputStyle, { flex: 1 }]} placeholder="you@company.com" placeholderTextColor={colors.textMuted} autoCapitalize="none" keyboardType="email-address" value={testEmail} onChangeText={setTestEmail} />
              <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 14, justifyContent: "center", opacity: testEmail.trim() ? 1 : 0.5 }} disabled={!testEmail.trim() || testMutation.isPending} onPress={() => testMutation.mutate()}>
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Send</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
      ListFooterComponent={
        <>
          <PickerModal visible={filterPickerOpen} title="Filter by event" options={[{ id: "", label: "All Events" }, ...eventOptions]} selectedId={eventFilter} onSelect={(v) => setEventFilter((v as EmailEventType) ?? "")} onClose={() => setFilterPickerOpen(false)} />
          <PickerModal visible={eventPickerOpen} title="Event" options={eventOptions} selectedId={eventType} onSelect={(v) => setEventType(v as EmailEventType)} onClose={() => setEventPickerOpen(false)} />
        </>
      }
    />
  );
}

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { TicketCategory, TicketPriority, TICKET_PRIORITY_OPTIONS } from "../../types/ticket";
import { HelpdeskStackParamList } from "../../navigation/types";

type PickerKey = "priority" | "category" | "template" | null;

interface TicketTemplate {
  id: number;
  name: string;
  itilType: string | null;
}
interface TicketTemplateField {
  fieldKey: string;
  mode: "HIDDEN" | "MANDATORY" | "READONLY" | "PREDEFINED";
  predefinedValue: string | null;
}

// Mirrors client/src/pages/helpdesk/TicketFormModal.tsx's template-driven create — applying a
// template can predefine, hide, or lock the fields this simpler mobile form exposes (title,
// description, priority, category). Fields the web form has that mobile doesn't (asset, location,
// type, ITIL type, assignees) aren't affected since mobile never surfaced them to begin with.
export function TicketFormScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<HelpdeskStackParamList>>();
  const queryClient = useQueryClient();

  const [templateId, setTemplateId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("MEDIUM");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [openPicker, setOpenPicker] = useState<PickerKey>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: templates } = useQuery({
    queryKey: ["mobile-ticket-templates"],
    queryFn: async () => (await axiosClient.get("/ticket-templates")).data as TicketTemplate[],
  });
  const { data: selectedTemplate } = useQuery({
    queryKey: ["mobile-ticket-template", templateId],
    queryFn: async () => (await axiosClient.get(`/ticket-templates/${templateId}`)).data as { fields: TicketTemplateField[] },
    enabled: templateId != null,
  });
  const { data: categories } = useQuery({
    queryKey: ["mobile-ticket-categories"],
    queryFn: async () => (await axiosClient.get("/ticket-categories")).data as TicketCategory[],
  });

  const fieldRules: Record<string, TicketTemplateField> = {};
  for (const f of selectedTemplate?.fields ?? []) fieldRules[f.fieldKey] = f;
  function isHidden(key: string) { return fieldRules[key]?.mode === "HIDDEN"; }
  function isReadonly(key: string) { return fieldRules[key]?.mode === "READONLY" || fieldRules[key]?.mode === "PREDEFINED"; }
  function isMandatory(key: string) { return fieldRules[key]?.mode === "MANDATORY"; }

  useEffect(() => {
    if (!selectedTemplate) return;
    for (const f of selectedTemplate.fields) {
      if (f.mode !== "PREDEFINED" || f.predefinedValue == null) continue;
      switch (f.fieldKey) {
        case "title": setTitle(f.predefinedValue); break;
        case "description": setDescription(f.predefinedValue); break;
        case "priority": setPriority(f.predefinedValue as TicketPriority); break;
        case "categoryId": setCategoryId(Number(f.predefinedValue)); break;
      }
    }
  }, [selectedTemplate]);

  const mutation = useMutation({
    mutationFn: () => axiosClient.post("/tickets", { title, description, priority, categoryId, templateId }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["mobile-tickets"] });
      navigation.replace("TicketDetail", { id: res.data.id });
    },
    onError: (err: any) => setError(err?.response?.data?.error ?? "Failed to create ticket."),
  });

  const priorityOptions: PickerOption[] = TICKET_PRIORITY_OPTIONS.map((p) => ({ id: p.value, label: p.label }));
  const categoryOptions: PickerOption[] = (categories ?? []).map((c) => ({ id: c.id, label: c.name }));
  const templateOptions: PickerOption[] = (templates ?? []).map((t) => ({ id: t.id, label: t.name }));
  const priorityLabel = TICKET_PRIORITY_OPTIONS.find((p) => p.value === priority)?.label ?? priority;
  const categoryLabel = categories?.find((c) => c.id === categoryId)?.name ?? "None";
  const templateLabel = templates?.find((t) => t.id === templateId)?.name ?? "No template";
  const canSubmit = (isHidden("title") || title.trim()) && (isHidden("description") || description.trim());

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      {error && (
        <View style={{ backgroundColor: colors.danger + "22", borderRadius: radius.md, padding: 12, marginBottom: spacing.md }}>
          <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text>
        </View>
      )}

      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 6, textTransform: "uppercase" }}>Template (optional)</Text>
      <TouchableOpacity
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surface, marginBottom: 14 }}
        onPress={() => setOpenPicker("template")}
      >
        <Text style={{ color: colors.text, fontSize: 14 }}>{templateLabel}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
      </TouchableOpacity>

      {!isHidden("title") && (
        <>
          <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 6, textTransform: "uppercase" }}>Title {isMandatory("title") ? "*" : ""}</Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface, marginBottom: 14, opacity: isReadonly("title") ? 0.6 : 1 }}
            placeholder="Brief summary of the issue"
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={setTitle}
            editable={!isReadonly("title")}
          />
        </>
      )}

      {!isHidden("description") && (
        <>
          <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 6, textTransform: "uppercase" }}>Description {isMandatory("description") ? "*" : ""}</Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface, marginBottom: 14, height: 120, textAlignVertical: "top", opacity: isReadonly("description") ? 0.6 : 1 }}
            placeholder="Describe what's happening..."
            placeholderTextColor={colors.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            editable={!isReadonly("description")}
          />
        </>
      )}

      {!isHidden("priority") && (
        <>
          <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 6, textTransform: "uppercase" }}>Priority {isMandatory("priority") ? "*" : ""}</Text>
          <TouchableOpacity
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surface, marginBottom: 14, opacity: isReadonly("priority") ? 0.6 : 1 }}
            disabled={isReadonly("priority")}
            onPress={() => setOpenPicker("priority")}
          >
            <Text style={{ color: colors.text, fontSize: 14 }}>{priorityLabel}</Text>
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </>
      )}

      {!isHidden("categoryId") && (
        <>
          <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 6, textTransform: "uppercase" }}>Category {isMandatory("categoryId") ? "*" : ""}</Text>
          <TouchableOpacity
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surface, marginBottom: 14, opacity: isReadonly("categoryId") ? 0.6 : 1 }}
            disabled={isReadonly("categoryId")}
            onPress={() => setOpenPicker("category")}
          >
            <Text style={{ color: colors.text, fontSize: 14 }}>{categoryLabel}</Text>
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity
        style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 15, marginTop: spacing.md, opacity: canSubmit ? 1 : 0.6 }}
        disabled={!canSubmit || mutation.isPending}
        onPress={() => mutation.mutate()}
      >
        {mutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Create ticket</Text>}
      </TouchableOpacity>

      <PickerModal visible={openPicker === "template"} title="Template" options={templateOptions} selectedId={templateId} allowClear searchable onSelect={(v) => setTemplateId(v as number | null)} onClose={() => setOpenPicker(null)} />
      <PickerModal visible={openPicker === "priority"} title="Priority" options={priorityOptions} selectedId={priority} onSelect={(v) => setPriority(v as TicketPriority)} onClose={() => setOpenPicker(null)} />
      <PickerModal visible={openPicker === "category"} title="Category" options={categoryOptions} selectedId={categoryId} allowClear searchable onSelect={(v) => setCategoryId(v as number | null)} onClose={() => setOpenPicker(null)} />
    </ScrollView>
  );
}

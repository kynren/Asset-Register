import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, FlatList, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { ShimmerList } from "../../components/Shimmer";
import { PickerModal, PickerOption } from "../../components/PickerModal";

interface Ref { id: number; name: string }
interface TemplateField { fieldKey: string; mode: "HIDDEN" | "MANDATORY" | "READONLY" | "PREDEFINED"; predefinedValue: string | null }
interface Template { id: number; name: string; itilType: string; isDefault: boolean; fields: TemplateField[] }
interface Sla { id: number; name: string; ttoMinutes: number | null; ttrMinutes: number }
interface Recurrence {
  id: number; name: string; templateId: number; template: Ref; periodicityDays: number; createBeforeDays: number;
  nextCreationAt: string; endDate: string | null; isActive: boolean; lastCreatedTicket: { id: number; ticketNumber: string } | null;
}
interface Condition { field: string; operator: string; value: string }
interface Action { field: string; value: string }
interface Rule { id: number; name: string; isActive: boolean; order: number; conditions: Condition[]; actions: Action[] }
interface HelpdeskSettings { surveySampleRatePercent: number; surveyDelayDays: number; surveyExpireDays: number; autoCloseDelayDays: number }

const SUB_TABS = [
  { key: "templates", label: "Templates" },
  { key: "slas", label: "SLAs" },
  { key: "recurrences", label: "Recurring" },
  { key: "rules", label: "Rules" },
  { key: "settings", label: "Settings" },
] as const;
type SubTabKey = (typeof SUB_TABS)[number]["key"];

// Mirrors client/src/pages/admin/HelpdeskConfigTab.tsx's 5 sub-tabs.
export function HelpdeskConfigScreen() {
  const { colors } = useTheme();
  const [tab, setTab] = useState<SubTabKey>("templates");

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface }}>
        {SUB_TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={{ flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2, borderBottomColor: tab === t.key ? colors.primary : "transparent" }}
            onPress={() => setTab(t.key)}
          >
            <Text style={{ color: tab === t.key ? colors.primary : colors.textMuted, fontSize: 11, fontWeight: "700" }}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {tab === "templates" && <TicketTemplatesTab />}
      {tab === "slas" && <TicketSlasTab />}
      {tab === "recurrences" && <TicketRecurrencesTab />}
      {tab === "rules" && <TicketRulesTab />}
      {tab === "settings" && <HelpdeskSettingsTab />}
    </View>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ backgroundColor: color + "1e", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ color, fontSize: 10, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

const ITIL_TYPES = ["INCIDENT", "REQUEST", "PROBLEM", "CHANGE"];
const FIELD_KEYS = ["title", "description", "priority", "categoryId", "assetId", "locationId", "slaId"];
const FIELD_LABELS: Record<string, string> = { title: "Title", description: "Description", priority: "Priority", categoryId: "Category", assetId: "Asset", locationId: "Location", slaId: "SLA" };
const MODE_OPTIONS: PickerOption[] = [
  { id: "", label: "Default behavior" },
  { id: "HIDDEN", label: "Hidden" },
  { id: "MANDATORY", label: "Mandatory" },
  { id: "READONLY", label: "Read-only" },
  { id: "PREDEFINED", label: "Predefined value" },
];

function FieldsEditor({ template, colors, spacing, radius }: { template: Template; colors: any; spacing: any; radius: any }) {
  const queryClient = useQueryClient();
  const [fields, setFields] = useState<Record<string, TemplateField>>(() => {
    const map: Record<string, TemplateField> = {};
    for (const f of template.fields) map[f.fieldKey] = f;
    return map;
  });
  const [modePickerKey, setModePickerKey] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: () => axiosClient.put(`/ticket-templates/${template.id}/fields`, { fields: Object.values(fields) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-ticket-templates"] }),
  });

  function setMode(key: string, mode: string) {
    setFields((prev) => {
      const next = { ...prev };
      if (!mode) delete next[key];
      else next[key] = { fieldKey: key, mode: mode as TemplateField["mode"], predefinedValue: next[key]?.predefinedValue ?? null };
      return next;
    });
  }

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12.5, color: colors.text, backgroundColor: colors.surface };

  return (
    <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, gap: 8 }}>
      {FIELD_KEYS.map((key) => (
        <View key={key} style={{ gap: 4 }}>
          <Text style={{ color: colors.text, fontSize: 11.5, fontWeight: "700" }}>{FIELD_LABELS[key]}</Text>
          <TouchableOpacity style={[inputStyle, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]} onPress={() => setModePickerKey(key)}>
            <Text style={{ color: colors.text, fontSize: 12.5 }}>{MODE_OPTIONS.find((m) => m.id === (fields[key]?.mode ?? ""))?.label}</Text>
            <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
          </TouchableOpacity>
          {fields[key]?.mode === "PREDEFINED" && (
            <TextInput style={inputStyle} placeholder="Predefined value" placeholderTextColor={colors.textMuted} value={fields[key]?.predefinedValue ?? ""} onChangeText={(v) => setFields((prev) => ({ ...prev, [key]: { ...prev[key], predefinedValue: v } }))} />
          )}
        </View>
      ))}
      <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 10, alignSelf: "flex-start", paddingHorizontal: 16, opacity: saveMutation.isPending ? 0.6 : 1 }} disabled={saveMutation.isPending} onPress={() => saveMutation.mutate()}>
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>Save Field Rules</Text>
      </TouchableOpacity>
      <PickerModal visible={modePickerKey != null} title={modePickerKey ? FIELD_LABELS[modePickerKey] : ""} options={MODE_OPTIONS} selectedId={modePickerKey ? fields[modePickerKey]?.mode ?? "" : ""} onSelect={(id) => { if (modePickerKey) setMode(modePickerKey, String(id)); }} onClose={() => setModePickerKey(null)} />
    </View>
  );
}

function TicketTemplatesTab() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [itilType, setItilType] = useState("INCIDENT");
  const [itilPickerOpen, setItilPickerOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: templates, isLoading } = useQuery({ queryKey: ["mobile-ticket-templates"], queryFn: async () => (await axiosClient.get("/ticket-templates")).data as Template[] });

  function invalidate() { queryClient.invalidateQueries({ queryKey: ["mobile-ticket-templates"] }); }
  function closeForm() { setShowForm(false); setEditingId(null); setName(""); setItilType("INCIDENT"); }
  function startEdit(t: Template) { setEditingId(t.id); setName(t.name); setItilType(t.itilType); setShowForm(true); }

  const saveMutation = useMutation({
    mutationFn: () => (editingId != null ? axiosClient.patch(`/ticket-templates/${editingId}`, { name: name.trim(), itilType }) : axiosClient.post("/ticket-templates", { name: name.trim(), itilType })),
    onSuccess: () => { invalidate(); closeForm(); },
  });
  const deleteMutation = useMutation({ mutationFn: (id: number) => axiosClient.delete(`/ticket-templates/${id}`), onSuccess: invalidate });

  function confirmDelete(t: Template) {
    Alert.alert(`Delete "${t.name}"`, "Tickets already created from this template are unaffected.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(t.id) },
    ]);
  }

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface };
  const itilOptions: PickerOption[] = ITIL_TYPES.map((t) => ({ id: t, label: t }));

  if (isLoading) return <ShimmerList />;

  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
      data={templates ?? []}
      keyExtractor={(item) => String(item.id)}
      ListHeaderComponent={
        <View style={{ marginBottom: spacing.md }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 10 }}>A template controls which fields are hidden, mandatory, read-only, or pre-filled when a ticket is created.</Text>
          {!showForm ? (
            hasPermission("admin", "create") ? (
              <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12 }} onPress={() => setShowForm(true)}>
                <Ionicons name="add" size={16} color={colors.text} />
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>Add Template</Text>
              </TouchableOpacity>
            ) : null
          ) : (
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 10 }}>
              <TextInput style={inputStyle} placeholder="Template name" placeholderTextColor={colors.textMuted} value={name} onChangeText={setName} />
              <TouchableOpacity style={[inputStyle, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]} onPress={() => setItilPickerOpen(true)}>
                <Text style={{ color: colors.text, fontSize: 13.5 }}>{itilType}</Text>
                <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
              </TouchableOpacity>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: "center", paddingVertical: 10 }} onPress={closeForm}>
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12.5 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 10, opacity: name.trim() ? 1 : 0.5 }} disabled={!name.trim() || saveMutation.isPending} onPress={() => saveMutation.mutate()}>
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>{editingId != null ? "Save" : "Add Template"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      }
      ListEmptyComponent={!isLoading ? <Text style={{ color: colors.textMuted, textAlign: "center" }}>No templates defined yet.</Text> : null}
      renderItem={({ item: t }) => (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: 6 }}>
          <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "700" }}>{t.name}</Text>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
            <Chip label={t.itilType} color={colors.primary} />
            <Chip label={`${t.fields.length} field${t.fields.length === 1 ? "" : "s"}`} color={colors.textMuted} />
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => setExpandedId(expandedId === t.id ? null : t.id)}>
              <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>{expandedId === t.id ? "Hide Fields" : "Configure Fields"}</Text>
            </TouchableOpacity>
            {hasPermission("admin", "edit") && (
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => startEdit(t)}>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Edit</Text>
              </TouchableOpacity>
            )}
            {hasPermission("admin", "delete") && (
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => confirmDelete(t)}>
                <Text style={{ color: colors.danger, fontSize: 11, fontWeight: "700" }}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
          {expandedId === t.id && <FieldsEditor key={t.id} template={t} colors={colors} spacing={spacing} radius={radius} />}
        </View>
      )}
      ListFooterComponent={<PickerModal visible={itilPickerOpen} title="ITIL Type" options={itilOptions} selectedId={itilType} onSelect={(id) => setItilType(String(id))} onClose={() => setItilPickerOpen(false)} />}
    />
  );
}

function TicketSlasTab() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [tto, setTto] = useState("");
  const [ttr, setTtr] = useState("");

  const { data: slas, isLoading } = useQuery({ queryKey: ["mobile-ticket-slas"], queryFn: async () => (await axiosClient.get("/ticket-slas")).data as Sla[] });

  function invalidate() { queryClient.invalidateQueries({ queryKey: ["mobile-ticket-slas"] }); }
  function closeForm() { setShowForm(false); setEditingId(null); setName(""); setTto(""); setTtr(""); }
  function startEdit(s: Sla) { setEditingId(s.id); setName(s.name); setTto(s.ttoMinutes != null ? String(s.ttoMinutes) : ""); setTtr(String(s.ttrMinutes)); setShowForm(true); }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { name: name.trim(), ttoMinutes: tto ? Number(tto) : null, ttrMinutes: Number(ttr) };
      return editingId != null ? axiosClient.patch(`/ticket-slas/${editingId}`, payload) : axiosClient.post("/ticket-slas", payload);
    },
    onSuccess: () => { invalidate(); closeForm(); },
  });
  const deleteMutation = useMutation({ mutationFn: (id: number) => axiosClient.delete(`/ticket-slas/${id}`), onSuccess: invalidate });

  function confirmDelete(s: Sla) {
    Alert.alert(`Delete "${s.name}"`, "Tickets currently using this SLA will keep their existing due dates but the SLA link will be removed.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(s.id) },
    ]);
  }

  function formatMinutes(m: number | null) {
    if (m == null) return "—";
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return h ? `${h}h ${rem}m` : `${rem}m`;
  }

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface };

  if (isLoading) return <ShimmerList />;

  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
      data={slas ?? []}
      keyExtractor={(item) => String(item.id)}
      ListHeaderComponent={
        <View style={{ marginBottom: spacing.md }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 10 }}>TTO/TTR are calendar-time offsets from ticket creation — not business-hours aware.</Text>
          {!showForm ? (
            hasPermission("admin", "create") ? (
              <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12 }} onPress={() => setShowForm(true)}>
                <Ionicons name="add" size={16} color={colors.text} />
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>Add SLA</Text>
              </TouchableOpacity>
            ) : null
          ) : (
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 10 }}>
              <TextInput style={inputStyle} placeholder="Name" placeholderTextColor={colors.textMuted} value={name} onChangeText={setName} />
              <TextInput style={inputStyle} placeholder="TTO minutes (optional)" placeholderTextColor={colors.textMuted} keyboardType="number-pad" value={tto} onChangeText={setTto} />
              <TextInput style={inputStyle} placeholder="TTR minutes" placeholderTextColor={colors.textMuted} keyboardType="number-pad" value={ttr} onChangeText={setTtr} />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: "center", paddingVertical: 10 }} onPress={closeForm}>
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12.5 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 10, opacity: name.trim() && ttr ? 1 : 0.5 }} disabled={!name.trim() || !ttr || saveMutation.isPending} onPress={() => saveMutation.mutate()}>
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>{editingId != null ? "Save" : "Add SLA"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      }
      ListEmptyComponent={!isLoading ? <Text style={{ color: colors.textMuted, textAlign: "center" }}>No SLAs defined yet.</Text> : null}
      renderItem={({ item: s }) => (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: 6 }}>
          <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "700" }}>{s.name}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 4 }}>TTO {formatMinutes(s.ttoMinutes)} · TTR {formatMinutes(s.ttrMinutes)}</Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {hasPermission("admin", "edit") && (
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => startEdit(s)}>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Edit</Text>
              </TouchableOpacity>
            )}
            {hasPermission("admin", "delete") && (
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => confirmDelete(s)}>
                <Text style={{ color: colors.danger, fontSize: 11, fontWeight: "700" }}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    />
  );
}

function emptyRecurrenceForm() {
  return { name: "", templateId: null as number | null, periodicityDays: "7", createBeforeDays: "0", nextCreationAt: dayjs().format("YYYY-MM-DD HH:mm"), endDate: "" };
}

function TicketRecurrencesTab() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyRecurrenceForm());
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);

  const { data: recurrences, isLoading } = useQuery({ queryKey: ["mobile-ticket-recurrences"], queryFn: async () => (await axiosClient.get("/ticket-recurrences")).data as Recurrence[] });
  const { data: templates } = useQuery({ queryKey: ["mobile-ticket-templates-picker"], queryFn: async () => (await axiosClient.get("/ticket-templates")).data as Ref[] });

  function invalidate() { queryClient.invalidateQueries({ queryKey: ["mobile-ticket-recurrences"] }); }
  function closeForm() { setShowForm(false); setEditingId(null); setForm(emptyRecurrenceForm()); }
  function startEdit(r: Recurrence) {
    setEditingId(r.id);
    setForm({ name: r.name, templateId: r.templateId, periodicityDays: String(r.periodicityDays), createBeforeDays: String(r.createBeforeDays), nextCreationAt: dayjs(r.nextCreationAt).format("YYYY-MM-DD HH:mm"), endDate: r.endDate ? dayjs(r.endDate).format("YYYY-MM-DD HH:mm") : "" });
    setShowForm(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        templateId: form.templateId,
        periodicityDays: Number(form.periodicityDays),
        createBeforeDays: Number(form.createBeforeDays) || 0,
        nextCreationAt: dayjs(form.nextCreationAt, "YYYY-MM-DD HH:mm").toISOString(),
        endDate: form.endDate ? dayjs(form.endDate, "YYYY-MM-DD HH:mm").toISOString() : null,
      };
      return editingId != null ? axiosClient.patch(`/ticket-recurrences/${editingId}`, payload) : axiosClient.post("/ticket-recurrences", payload);
    },
    onSuccess: () => { invalidate(); closeForm(); },
  });
  const toggleActiveMutation = useMutation({ mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => axiosClient.patch(`/ticket-recurrences/${id}`, { isActive }), onSuccess: invalidate });
  const deleteMutation = useMutation({ mutationFn: (id: number) => axiosClient.delete(`/ticket-recurrences/${id}`), onSuccess: invalidate });

  function confirmDelete(r: Recurrence) {
    Alert.alert(`Delete "${r.name}"`, "This recurrence rule will stop creating new tickets.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(r.id) },
    ]);
  }

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface };
  const templateOptions: PickerOption[] = (templates ?? []).map((t) => ({ id: t.id, label: t.name }));
  const canSave = form.name.trim() && form.templateId != null && form.periodicityDays;

  if (isLoading) return <ShimmerList />;

  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
      data={recurrences ?? []}
      keyExtractor={(item) => String(item.id)}
      ListHeaderComponent={
        <View style={{ marginBottom: spacing.md }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 10 }}>A new ticket is stamped out from the template every N days, up to a set number of days ahead of the actual due occurrence.</Text>
          {!showForm ? (
            hasPermission("admin", "create") ? (
              <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12 }} onPress={() => setShowForm(true)}>
                <Ionicons name="add" size={16} color={colors.text} />
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>Add Recurrence</Text>
              </TouchableOpacity>
            ) : null
          ) : (
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 10 }}>
              <TextInput style={inputStyle} placeholder="Name" placeholderTextColor={colors.textMuted} value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} />
              <TouchableOpacity style={[inputStyle, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]} onPress={() => setTemplatePickerOpen(true)}>
                <Text style={{ color: form.templateId ? colors.text : colors.textMuted, fontSize: 13.5 }}>{templates?.find((t) => t.id === form.templateId)?.name ?? "Select template…"}</Text>
                <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
              </TouchableOpacity>
              <TextInput style={inputStyle} placeholder="Every N days" placeholderTextColor={colors.textMuted} keyboardType="number-pad" value={form.periodicityDays} onChangeText={(v) => setForm((f) => ({ ...f, periodicityDays: v }))} />
              <TextInput style={inputStyle} placeholder="Create N days before" placeholderTextColor={colors.textMuted} keyboardType="number-pad" value={form.createBeforeDays} onChangeText={(v) => setForm((f) => ({ ...f, createBeforeDays: v }))} />
              <View>
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", marginBottom: 4 }}>Next creation (YYYY-MM-DD HH:mm)</Text>
                <TextInput style={inputStyle} placeholder="YYYY-MM-DD HH:mm" placeholderTextColor={colors.textMuted} value={form.nextCreationAt} onChangeText={(v) => setForm((f) => ({ ...f, nextCreationAt: v }))} />
              </View>
              <View>
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", marginBottom: 4 }}>End date (optional)</Text>
                <TextInput style={inputStyle} placeholder="YYYY-MM-DD HH:mm" placeholderTextColor={colors.textMuted} value={form.endDate} onChangeText={(v) => setForm((f) => ({ ...f, endDate: v }))} />
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: "center", paddingVertical: 10 }} onPress={closeForm}>
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12.5 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 10, opacity: canSave ? 1 : 0.5 }} disabled={!canSave || saveMutation.isPending} onPress={() => saveMutation.mutate()}>
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>{editingId != null ? "Save" : "Add Recurrence"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      }
      ListEmptyComponent={!isLoading ? <Text style={{ color: colors.textMuted, textAlign: "center" }}>No recurring tickets configured.</Text> : null}
      renderItem={({ item: r }) => (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "700" }}>{r.name}</Text>
            <Switch value={r.isActive} onValueChange={(v) => toggleActiveMutation.mutate({ id: r.id, isActive: v })} trackColor={{ true: colors.primary, false: colors.border }} />
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 4 }}>{r.template.name} · every {r.periodicityDays} day{r.periodicityDays === 1 ? "" : "s"}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 10.5, marginTop: 2 }}>Next: {dayjs(r.nextCreationAt).format("DD MMM YYYY, HH:mm")}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 10.5, marginTop: 2 }}>Last ticket: {r.lastCreatedTicket?.ticketNumber ?? "—"}</Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {hasPermission("admin", "edit") && (
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => startEdit(r)}>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Edit</Text>
              </TouchableOpacity>
            )}
            {hasPermission("admin", "delete") && (
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => confirmDelete(r)}>
                <Text style={{ color: colors.danger, fontSize: 11, fontWeight: "700" }}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
      ListFooterComponent={<PickerModal visible={templatePickerOpen} title="Template" options={templateOptions} selectedId={form.templateId} onSelect={(id) => setForm((f) => ({ ...f, templateId: id as number | null }))} onClose={() => setTemplatePickerOpen(false)} />}
    />
  );
}

const CONDITION_FIELDS = ["title", "description", "priority", "categoryId", "assetId", "locationId", "itilType", "type", "requesterId"];
const OPERATORS: PickerOption[] = [
  { id: "equals", label: "equals" },
  { id: "not_equals", label: "does not equal" },
  { id: "contains", label: "contains" },
  { id: "is_empty", label: "is empty" },
  { id: "is_not_empty", label: "is not empty" },
];
const ACTION_FIELDS = ["categoryId", "assetId", "locationId", "templateId", "slaId", "priority", "itilType", "type"];

function emptyRuleForm(): { name: string; conditions: Condition[]; actions: Action[] } {
  return { name: "", conditions: [{ field: "title", operator: "contains", value: "" }], actions: [{ field: "priority", value: "" }] };
}

function TicketRulesTab() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyRuleForm());
  const [conditionFieldPicker, setConditionFieldPicker] = useState<number | null>(null);
  const [conditionOpPicker, setConditionOpPicker] = useState<number | null>(null);
  const [actionFieldPicker, setActionFieldPicker] = useState<number | null>(null);

  const { data: rules, isLoading } = useQuery({ queryKey: ["mobile-ticket-rules"], queryFn: async () => (await axiosClient.get("/ticket-rules")).data as Rule[] });

  function invalidate() { queryClient.invalidateQueries({ queryKey: ["mobile-ticket-rules"] }); }
  function closeForm() { setShowForm(false); setEditingId(null); setForm(emptyRuleForm()); }
  function startEdit(r: Rule) {
    setEditingId(r.id);
    setForm({ name: r.name, conditions: r.conditions.length ? r.conditions : emptyRuleForm().conditions, actions: r.actions.length ? r.actions : emptyRuleForm().actions });
    setShowForm(true);
  }
  function updateCondition(i: number, patch: Partial<Condition>) { setForm((f) => ({ ...f, conditions: f.conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) })); }
  function updateAction(i: number, patch: Partial<Action>) { setForm((f) => ({ ...f, actions: f.actions.map((a, idx) => (idx === i ? { ...a, ...patch } : a)) })); }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: { name: string; conditions: Condition[]; actions: Action[]; order?: number } = { name: form.name.trim(), conditions: form.conditions, actions: form.actions };
      if (editingId != null) return axiosClient.patch(`/ticket-rules/${editingId}`, payload);
      payload.order = rules?.length ?? 0;
      return axiosClient.post("/ticket-rules", payload);
    },
    onSuccess: () => { invalidate(); closeForm(); },
  });
  const toggleActiveMutation = useMutation({ mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => axiosClient.patch(`/ticket-rules/${id}`, { isActive }), onSuccess: invalidate });
  const deleteMutation = useMutation({ mutationFn: (id: number) => axiosClient.delete(`/ticket-rules/${id}`), onSuccess: invalidate });

  function confirmDelete(r: Rule) {
    Alert.alert(`Delete "${r.name}"`, "This rule will no longer run on new tickets.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(r.id) },
    ]);
  }

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 12.5, color: colors.text, backgroundColor: colors.surface };
  const fieldOptions: PickerOption[] = CONDITION_FIELDS.map((f) => ({ id: f, label: f }));
  const actionFieldOptions: PickerOption[] = ACTION_FIELDS.map((f) => ({ id: f, label: f }));

  if (isLoading) return <ShimmerList />;

  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
      data={rules ?? []}
      keyExtractor={(item) => String(item.id)}
      ListHeaderComponent={
        <View style={{ marginBottom: spacing.md }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 10 }}>Rules run in order on every new ticket, before SLA resolution. All conditions on a rule must match.</Text>
          {!showForm ? (
            hasPermission("admin", "create") ? (
              <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12 }} onPress={() => setShowForm(true)}>
                <Ionicons name="add" size={16} color={colors.text} />
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>Add Rule</Text>
              </TouchableOpacity>
            ) : null
          ) : (
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 10 }}>
              <TextInput style={inputStyle} placeholder="Rule name" placeholderTextColor={colors.textMuted} value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} />

              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" }}>Conditions (all must match)</Text>
              {form.conditions.map((c, i) => (
                <View key={i} style={{ gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 8 }}>
                  <TouchableOpacity style={[inputStyle, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]} onPress={() => setConditionFieldPicker(i)}>
                    <Text style={{ color: colors.text, fontSize: 12.5 }}>{c.field}</Text>
                    <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity style={[inputStyle, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]} onPress={() => setConditionOpPicker(i)}>
                    <Text style={{ color: colors.text, fontSize: 12.5 }}>{OPERATORS.find((o) => o.id === c.operator)?.label}</Text>
                    <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
                  </TouchableOpacity>
                  {c.operator !== "is_empty" && c.operator !== "is_not_empty" && (
                    <TextInput style={inputStyle} placeholder="Value" placeholderTextColor={colors.textMuted} value={c.value} onChangeText={(v) => updateCondition(i, { value: v })} />
                  )}
                  <TouchableOpacity style={{ alignSelf: "flex-end" }} onPress={() => setForm((f) => ({ ...f, conditions: f.conditions.filter((_, idx) => idx !== i) }))}>
                    <Ionicons name="trash-outline" size={16} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 4 }} onPress={() => setForm((f) => ({ ...f, conditions: [...f.conditions, { field: "title", operator: "contains", value: "" }] }))}>
                <Ionicons name="add" size={14} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>Add Condition</Text>
              </TouchableOpacity>

              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginTop: 6 }}>Actions (applied when conditions match)</Text>
              {form.actions.map((a, i) => (
                <View key={i} style={{ gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 8 }}>
                  <TouchableOpacity style={[inputStyle, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]} onPress={() => setActionFieldPicker(i)}>
                    <Text style={{ color: colors.text, fontSize: 12.5 }}>{a.field}</Text>
                    <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
                  </TouchableOpacity>
                  <TextInput style={inputStyle} placeholder="Value" placeholderTextColor={colors.textMuted} value={a.value} onChangeText={(v) => updateAction(i, { value: v })} />
                  <TouchableOpacity style={{ alignSelf: "flex-end" }} onPress={() => setForm((f) => ({ ...f, actions: f.actions.filter((_, idx) => idx !== i) }))}>
                    <Ionicons name="trash-outline" size={16} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 4 }} onPress={() => setForm((f) => ({ ...f, actions: [...f.actions, { field: "priority", value: "" }] }))}>
                <Ionicons name="add" size={14} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>Add Action</Text>
              </TouchableOpacity>

              <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: "center", paddingVertical: 10 }} onPress={closeForm}>
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12.5 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 10, opacity: form.name.trim() ? 1 : 0.5 }} disabled={!form.name.trim() || saveMutation.isPending} onPress={() => saveMutation.mutate()}>
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>{editingId != null ? "Save Rule" : "Add Rule"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      }
      ListEmptyComponent={!isLoading ? <Text style={{ color: colors.textMuted, textAlign: "center" }}>No business rules defined yet.</Text> : null}
      renderItem={({ item: r }) => (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "700" }}>{r.order}. {r.name}</Text>
            <Switch value={r.isActive} onValueChange={(v) => toggleActiveMutation.mutate({ id: r.id, isActive: v })} trackColor={{ true: colors.primary, false: colors.border }} />
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 4 }}>{r.conditions.length} condition{r.conditions.length === 1 ? "" : "s"} · {r.actions.length} action{r.actions.length === 1 ? "" : "s"}</Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {hasPermission("admin", "edit") && (
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => startEdit(r)}>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Edit</Text>
              </TouchableOpacity>
            )}
            {hasPermission("admin", "delete") && (
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => confirmDelete(r)}>
                <Text style={{ color: colors.danger, fontSize: 11, fontWeight: "700" }}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
      ListFooterComponent={
        <>
          <PickerModal visible={conditionFieldPicker != null} title="Field" options={fieldOptions} selectedId={conditionFieldPicker != null ? form.conditions[conditionFieldPicker]?.field : null} onSelect={(id) => { if (conditionFieldPicker != null) updateCondition(conditionFieldPicker, { field: String(id) }); }} onClose={() => setConditionFieldPicker(null)} />
          <PickerModal visible={conditionOpPicker != null} title="Operator" options={OPERATORS} selectedId={conditionOpPicker != null ? form.conditions[conditionOpPicker]?.operator : null} onSelect={(id) => { if (conditionOpPicker != null) updateCondition(conditionOpPicker, { operator: String(id) }); }} onClose={() => setConditionOpPicker(null)} />
          <PickerModal visible={actionFieldPicker != null} title="Field" options={actionFieldOptions} selectedId={actionFieldPicker != null ? form.actions[actionFieldPicker]?.field : null} onSelect={(id) => { if (actionFieldPicker != null) updateAction(actionFieldPicker, { field: String(id) }); }} onClose={() => setActionFieldPicker(null)} />
        </>
      }
    />
  );
}

function HelpdeskSettingsTab() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["mobile-helpdesk-settings"], queryFn: async () => (await axiosClient.get("/helpdesk-settings")).data as HelpdeskSettings });
  const [form, setForm] = useState<HelpdeskSettings>({ surveySampleRatePercent: 100, surveyDelayDays: 1, surveyExpireDays: 30, autoCloseDelayDays: 4 });

  useEffect(() => { if (data) setForm(data); }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => axiosClient.put("/helpdesk-settings", form),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-helpdesk-settings"] }),
  });

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface };

  if (isLoading) return <ShimmerList />;

  const fields: { key: keyof HelpdeskSettings; label: string; hint?: string }[] = [
    { key: "surveySampleRatePercent", label: "Satisfaction survey sample rate (%)", hint: "Percentage of closed tickets that get asked for a rating." },
    { key: "surveyDelayDays", label: "Survey delay (days after close)" },
    { key: "surveyExpireDays", label: "Survey expiry (days after close)", hint: "Tickets closed longer ago than this are never surveyed." },
    { key: "autoCloseDelayDays", label: "Auto-close delay (days after a solution is proposed)", hint: "Set to 0 to accept and close solutions immediately." },
  ];

  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
      data={fields}
      keyExtractor={(f) => f.key}
      renderItem={({ item: f }) => (
        <View style={{ gap: 4 }}>
          <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "700" }}>{f.label}</Text>
          <TextInput style={inputStyle} keyboardType="number-pad" value={String(form[f.key])} onChangeText={(v) => setForm((prev) => ({ ...prev, [f.key]: Number(v) || 0 }))} />
          {f.hint && <Text style={{ color: colors.textMuted, fontSize: 11 }}>{f.hint}</Text>}
        </View>
      )}
      ListFooterComponent={
        hasPermission("admin", "edit") ? (
          <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, marginTop: spacing.sm, opacity: saveMutation.isPending ? 0.6 : 1 }} disabled={saveMutation.isPending} onPress={() => saveMutation.mutate()}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Save Settings</Text>
          </TouchableOpacity>
        ) : null
      }
    />
  );
}

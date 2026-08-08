import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, FlatList, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { ShimmerList } from "../../components/Shimmer";
import { PickerModal, PickerOption } from "../../components/PickerModal";

interface Condition { field: string; operator: string; value: string }
interface Action { field: string; value: string }
type Trigger = "ON_CREATE" | "ON_UPDATE" | "ON_CREATE_OR_UPDATE";
interface Rule { id: number; name: string; isActive: boolean; order: number; trigger: Trigger; conditions: Condition[]; actions: Action[] }

const OPERATORS: PickerOption[] = [
  { id: "equals", label: "equals" },
  { id: "not_equals", label: "does not equal" },
  { id: "contains", label: "contains" },
  { id: "is_empty", label: "is empty" },
  { id: "is_not_empty", label: "is not empty" },
];
const TRIGGER_OPTIONS: PickerOption[] = [
  { id: "ON_CREATE_OR_UPDATE", label: "On create or update" },
  { id: "ON_CREATE", label: "On create only" },
  { id: "ON_UPDATE", label: "On update only" },
];

const ASSET_CONDITION_FIELDS = ["name", "assetTag", "status", "manufacturer", "model", "categoryId", "locationId"];
const ASSET_ACTION_FIELDS = ["status", "categoryId", "locationId", "assignedToId", "manufacturer"];
const STOCK_CONDITION_FIELDS = ["name", "sku", "category", "unit"];
const STOCK_ACTION_FIELDS = ["category", "unit", "reorderLevel"];

// Mirrors client/src/pages/admin/AutomationRulesTab.tsx + RecordRulesPanel.tsx — generic
// condition/action rule engine (server/src/lib/recordRules.ts) shared by Assets and Stock.
export function AutomationRulesScreen() {
  const { colors, spacing } = useTheme();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: spacing.xl }}>
      <RecordRulesPanel
        entityType="Asset"
        module="assets"
        title="Asset Automation Rules"
        description="Rules run on every asset create and/or update, before it's saved. All conditions on a rule must match."
        conditionFields={ASSET_CONDITION_FIELDS}
        actionFields={ASSET_ACTION_FIELDS}
      />
      <RecordRulesPanel
        entityType="StockItem"
        module="stock"
        title="Stock Automation Rules"
        description="Rules run on every stock item create and/or update, before it's saved. All conditions on a rule must match."
        conditionFields={STOCK_CONDITION_FIELDS}
        actionFields={STOCK_ACTION_FIELDS}
      />
    </ScrollView>
  );
}

function emptyRuleForm(conditionFields: string[], actionFields: string[]) {
  return { name: "", trigger: "ON_CREATE_OR_UPDATE" as Trigger, conditions: [{ field: conditionFields[0], operator: "contains", value: "" }], actions: [{ field: actionFields[0], value: "" }] };
}

function RecordRulesPanel({ entityType, module, title, description, conditionFields, actionFields }: { entityType: string; module: "assets" | "stock"; title: string; description: string; conditionFields: string[]; actionFields: string[] }) {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["mobile-record-rules", entityType];
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyRuleForm(conditionFields, actionFields));
  const [triggerPickerOpen, setTriggerPickerOpen] = useState(false);
  const [conditionFieldPicker, setConditionFieldPicker] = useState<number | null>(null);
  const [conditionOpPicker, setConditionOpPicker] = useState<number | null>(null);
  const [actionFieldPicker, setActionFieldPicker] = useState<number | null>(null);

  const { data: rules, isLoading } = useQuery({ queryKey, queryFn: async () => (await axiosClient.get("/record-rules", { params: { entityType } })).data as Rule[] });

  function invalidate() { queryClient.invalidateQueries({ queryKey }); }
  function closeForm() { setShowForm(false); setEditingId(null); setForm(emptyRuleForm(conditionFields, actionFields)); }
  function startEdit(r: Rule) {
    setEditingId(r.id);
    setForm({ name: r.name, trigger: r.trigger, conditions: r.conditions.length ? r.conditions : emptyRuleForm(conditionFields, actionFields).conditions, actions: r.actions.length ? r.actions : emptyRuleForm(conditionFields, actionFields).actions });
    setShowForm(true);
  }
  function updateCondition(i: number, patch: Partial<Condition>) { setForm((f) => ({ ...f, conditions: f.conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) })); }
  function updateAction(i: number, patch: Partial<Action>) { setForm((f) => ({ ...f, actions: f.actions.map((a, idx) => (idx === i ? { ...a, ...patch } : a)) })); }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: { entityType?: string; name: string; trigger: Trigger; conditions: Condition[]; actions: Action[]; order?: number } = { name: form.name.trim(), trigger: form.trigger, conditions: form.conditions, actions: form.actions };
      if (editingId != null) return axiosClient.patch(`/record-rules/${editingId}`, payload);
      payload.entityType = entityType;
      payload.order = rules?.length ?? 0;
      return axiosClient.post("/record-rules", payload);
    },
    onSuccess: () => { invalidate(); closeForm(); },
  });
  const toggleActiveMutation = useMutation({ mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => axiosClient.patch(`/record-rules/${id}`, { isActive }), onSuccess: invalidate });
  const deleteMutation = useMutation({ mutationFn: (id: number) => axiosClient.delete(`/record-rules/${id}`), onSuccess: invalidate });

  function confirmDelete(r: Rule) {
    Alert.alert(`Delete "${r.name}"`, "This rule will no longer run.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(r.id) },
    ]);
  }

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 12.5, color: colors.text, backgroundColor: colors.bg };
  const fieldOptions: PickerOption[] = conditionFields.map((f) => ({ id: f, label: f }));
  const actionFieldOptions: PickerOption[] = actionFields.map((f) => ({ id: f, label: f }));

  return (
    <View style={{ margin: spacing.lg, marginBottom: 0, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>{title}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4, marginBottom: 10 }}>{description}</Text>

      {isLoading ? (
        <ShimmerList />
      ) : (
        <>
          {!showForm ? (
            hasPermission(module, "create") ? (
              <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12, marginBottom: 10 }} onPress={() => setShowForm(true)}>
                <Ionicons name="add" size={16} color={colors.text} />
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>Add Rule</Text>
              </TouchableOpacity>
            ) : null
          ) : (
            <View style={{ backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 10, marginBottom: 10 }}>
              <TextInput style={inputStyle} placeholder="Rule name" placeholderTextColor={colors.textMuted} value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} />
              <TouchableOpacity style={[inputStyle, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]} onPress={() => setTriggerPickerOpen(true)}>
                <Text style={{ color: colors.text, fontSize: 12.5 }}>{TRIGGER_OPTIONS.find((t) => t.id === form.trigger)?.label}</Text>
                <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
              </TouchableOpacity>

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
              <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 4 }} onPress={() => setForm((f) => ({ ...f, conditions: [...f.conditions, { field: conditionFields[0], operator: "contains", value: "" }] }))}>
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
              <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 4 }} onPress={() => setForm((f) => ({ ...f, actions: [...f.actions, { field: actionFields[0], value: "" }] }))}>
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

          {(rules ?? []).length === 0 ? (
            <Text style={{ color: colors.textMuted, textAlign: "center", paddingVertical: 8 }}>No automation rules defined yet.</Text>
          ) : (
            <FlatList
              data={rules ?? []}
              keyExtractor={(item) => String(item.id)}
              scrollEnabled={false}
              renderItem={({ item: r }) => (
                <View style={{ backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: 6 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "700" }}>{r.order}. {r.name}</Text>
                    <Switch value={r.isActive} onValueChange={(v) => toggleActiveMutation.mutate({ id: r.id, isActive: v })} trackColor={{ true: colors.primary, false: colors.border }} />
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 4 }}>{TRIGGER_OPTIONS.find((t) => t.id === r.trigger)?.label} · {r.conditions.length} condition{r.conditions.length === 1 ? "" : "s"} · {r.actions.length} action{r.actions.length === 1 ? "" : "s"}</Text>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    {hasPermission(module, "edit") && (
                      <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => startEdit(r)}>
                        <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Edit</Text>
                      </TouchableOpacity>
                    )}
                    {hasPermission(module, "delete") && (
                      <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => confirmDelete(r)}>
                        <Text style={{ color: colors.danger, fontSize: 11, fontWeight: "700" }}>Delete</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}
            />
          )}
        </>
      )}

      <PickerModal visible={triggerPickerOpen} title="Trigger" options={TRIGGER_OPTIONS} selectedId={form.trigger} onSelect={(id) => setForm((f) => ({ ...f, trigger: id as Trigger }))} onClose={() => setTriggerPickerOpen(false)} />
      <PickerModal visible={conditionFieldPicker != null} title="Field" options={fieldOptions} selectedId={conditionFieldPicker != null ? form.conditions[conditionFieldPicker]?.field : null} onSelect={(id) => { if (conditionFieldPicker != null) updateCondition(conditionFieldPicker, { field: String(id) }); }} onClose={() => setConditionFieldPicker(null)} />
      <PickerModal visible={conditionOpPicker != null} title="Operator" options={OPERATORS} selectedId={conditionOpPicker != null ? form.conditions[conditionOpPicker]?.operator : null} onSelect={(id) => { if (conditionOpPicker != null) updateCondition(conditionOpPicker, { operator: String(id) }); }} onClose={() => setConditionOpPicker(null)} />
      <PickerModal visible={actionFieldPicker != null} title="Field" options={actionFieldOptions} selectedId={actionFieldPicker != null ? form.actions[actionFieldPicker]?.field : null} onSelect={(id) => { if (actionFieldPicker != null) updateAction(actionFieldPicker, { field: String(id) }); }} onClose={() => setActionFieldPicker(null)} />
    </View>
  );
}

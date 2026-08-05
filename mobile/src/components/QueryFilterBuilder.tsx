import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../api/axiosClient";
import { useTheme } from "../theme/ThemeContext";
import { PickerModal, PickerOption } from "./PickerModal";
import { FieldDef, FieldOption, OPERATOR_LABELS, SourceDef } from "../lib/dataExplorerConfig";

export interface FilterCondition {
  field: string;
  operator: string;
  value: string | string[];
}

function useFieldOptions(field: FieldDef | undefined) {
  const { data } = useQuery<FieldOption[]>({
    queryKey: ["mobile-data-explorer-options", field?.dynamicOptions],
    queryFn: async (): Promise<FieldOption[]> => {
      switch (field!.dynamicOptions) {
        case "assetCategories":
          return (await axiosClient.get("/asset-categories")).data.map((c: any) => ({ value: String(c.id), label: c.name }));
        case "locations":
          return (await axiosClient.get("/locations")).data.map((l: any) => ({ value: String(l.id), label: l.name }));
        case "ticketCategories":
          return (await axiosClient.get("/ticket-categories")).data.map((c: any) => ({ value: String(c.id), label: c.name }));
        case "users":
          return (await axiosClient.get("/users/directory")).data.map((u: any) => ({ value: String(u.id), label: `${u.firstName} ${u.lastName}` }));
        case "roles":
          return (await axiosClient.get("/roles")).data.map((r: any) => ({ value: String(r.id), label: r.name }));
        default:
          return [];
      }
    },
    enabled: !!field?.dynamicOptions,
  });
  const options: FieldOption[] = field?.options ?? data ?? [];
  return options;
}

function ChipButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors, radius } = useTheme();
  return (
    <TouchableOpacity
      style={{ flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: colors.surface }}
      onPress={onPress}
    >
      <Text style={{ color: colors.text, fontSize: 12 }} numberOfLines={1}>{label}</Text>
      <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

function ValueInput({ field, operator, value, onChange }: { field: FieldDef; operator: string; value: string | string[]; onChange: (v: string | string[]) => void }) {
  const { colors, radius } = useTheme();
  const options = useFieldOptions(field);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (operator === "in") {
    const selected = Array.isArray(value) ? value : [];
    const label = selected.length ? `${selected.length} selected` : "Select values...";
    return (
      <View>
        <ChipButton label={label} onPress={() => setPickerOpen(true)} />
        <PickerModal
          visible={pickerOpen}
          title={`Select ${field.label}`}
          options={options.map((o) => ({ id: o.value, label: o.label }))}
          selectedId={null}
          searchable
          onSelect={(v) => {
            if (v == null) return;
            const id = String(v);
            onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
          }}
          onClose={() => setPickerOpen(false)}
        />
      </View>
    );
  }

  const strValue = typeof value === "string" ? value : "";

  if (field.type === "boolean") {
    const boolOptions: PickerOption[] = [{ id: "true", label: "Yes" }, { id: "false", label: "No" }];
    return (
      <View>
        <ChipButton label={strValue === "false" ? "No" : "Yes"} onPress={() => setPickerOpen(true)} />
        <PickerModal visible={pickerOpen} title="Value" options={boolOptions} selectedId={strValue || "true"} onSelect={(v) => onChange(String(v))} onClose={() => setPickerOpen(false)} />
      </View>
    );
  }

  if (field.type === "enum" && options.length) {
    const enumOptions: PickerOption[] = options.map((o) => ({ id: o.value, label: o.label }));
    const selectedLabel = enumOptions.find((o) => o.id === strValue)?.label ?? "Select...";
    return (
      <View>
        <ChipButton label={selectedLabel} onPress={() => setPickerOpen(true)} />
        <PickerModal visible={pickerOpen} title={`Select ${field.label}`} options={enumOptions} selectedId={strValue} onSelect={(v) => onChange(String(v ?? ""))} onClose={() => setPickerOpen(false)} />
      </View>
    );
  }

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 7, fontSize: 12.5, color: colors.text, backgroundColor: colors.surface, minWidth: 100 };

  if (field.type === "date") {
    return <TextInput style={inputStyle} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} value={strValue} onChangeText={onChange} />;
  }
  if (field.type === "number") {
    return <TextInput style={inputStyle} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="numeric" value={strValue} onChangeText={onChange} />;
  }
  return <TextInput style={inputStyle} placeholder="Value" placeholderTextColor={colors.textMuted} value={strValue} onChangeText={onChange} />;
}

function ConditionRow({ source, condition, onChange, onRemove }: { source: SourceDef; condition: FilterCondition; onChange: (next: FilterCondition) => void; onRemove: () => void }) {
  const { colors } = useTheme();
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const [operatorPickerOpen, setOperatorPickerOpen] = useState(false);
  const field = source.fields.find((f) => f.key === condition.field) ?? source.fields[0];

  const fieldOptions: PickerOption[] = source.fields.map((f) => ({ id: f.key, label: f.label }));
  const operatorOptions: PickerOption[] = field.operators.map((op) => ({ id: op, label: OPERATOR_LABELS[op] ?? op }));

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: 8 }}>
      <ChipButton label={field.label} onPress={() => setFieldPickerOpen(true)} />
      <ChipButton label={OPERATOR_LABELS[condition.operator] ?? condition.operator} onPress={() => setOperatorPickerOpen(true)} />
      <ValueInput field={field} operator={condition.operator} value={condition.value} onChange={(v) => onChange({ ...condition, value: v })} />
      <TouchableOpacity onPress={onRemove} style={{ padding: 4 }}>
        <Ionicons name="close-circle-outline" size={18} color={colors.danger} />
      </TouchableOpacity>

      <PickerModal
        visible={fieldPickerOpen}
        title="Field"
        options={fieldOptions}
        selectedId={field.key}
        onSelect={(v) => {
          const nextField = source.fields.find((f) => f.key === v)!;
          onChange({ field: nextField.key, operator: nextField.operators[0], value: "" });
        }}
        onClose={() => setFieldPickerOpen(false)}
      />
      <PickerModal
        visible={operatorPickerOpen}
        title="Operator"
        options={operatorOptions}
        selectedId={condition.operator}
        onSelect={(v) => onChange({ ...condition, operator: String(v), value: v === "in" ? [] : "" })}
        onClose={() => setOperatorPickerOpen(false)}
      />
    </View>
  );
}

// Mirrors client/src/components/QueryFilterBuilder.tsx — same AND/OR + condition-row model driven
// by a SourceDef from lib/dataExplorerConfig.ts, adapted to PickerModal instead of ChipSelect.
export function QueryFilterBuilder({
  source,
  combinator,
  conditions,
  onCombinatorChange,
  onConditionsChange,
}: {
  source: SourceDef;
  combinator: "AND" | "OR";
  conditions: FilterCondition[];
  onCombinatorChange: (combinator: "AND" | "OR") => void;
  onConditionsChange: (conditions: FilterCondition[]) => void;
}) {
  const { colors, radius } = useTheme();

  function addCondition() {
    const field = source.fields[0];
    onConditionsChange([...conditions, { field: field.key, operator: field.operators[0], value: "" }]);
  }

  return (
    <View>
      {conditions.length > 1 && (
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
          {(["AND", "OR"] as const).map((c) => (
            <TouchableOpacity key={c} style={{ flexDirection: "row", alignItems: "center", gap: 5 }} onPress={() => onCombinatorChange(c)}>
              <Ionicons name={combinator === c ? "radio-button-on" : "radio-button-off"} size={16} color={colors.primary} />
              <Text style={{ color: colors.text, fontSize: 12 }}>{c === "AND" ? "Match ALL" : "Match ANY"}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {conditions.map((c, i) => (
        <ConditionRow
          key={i}
          source={source}
          condition={c}
          onChange={(next) => onConditionsChange(conditions.map((cc, ii) => (ii === i ? next : cc)))}
          onRemove={() => onConditionsChange(conditions.filter((_, ii) => ii !== i))}
        />
      ))}
      <TouchableOpacity
        style={{ flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 7, alignSelf: "flex-start" }}
        onPress={addCondition}
      >
        <Ionicons name="add" size={14} color={colors.text} />
        <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600" }}>Add Condition</Text>
      </TouchableOpacity>
    </View>
  );
}

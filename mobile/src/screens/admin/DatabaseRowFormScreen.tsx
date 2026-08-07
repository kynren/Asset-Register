import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { KeyboardAvoidingScreen } from "../../components/KeyboardAvoidingScreen";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { DbFieldInfo, DbListResult, SENSITIVE_FIELD_PATTERN, SchemaRegistry } from "../../lib/databaseTypes";
import { MoreStackParamList } from "../../navigation/types";

function FkField({ field, value, onChange }: { field: DbFieldInfo; value: string; onChange: (v: string) => void }) {
  const { colors, radius } = useTheme();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["mobile-db-options", field.relationModel],
    queryFn: async () => (await axiosClient.get(`/database/tables/${field.relationModel}/options`)).data as { id: number; label: string }[],
  });
  const options: PickerOption[] = (data ?? []).map((o) => ({ id: String(o.id), label: `${o.label} (#${o.id})` }));
  const selected = options.find((o) => o.id === value);

  return (
    <View>
      <TouchableOpacity
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: colors.surface }}
        onPress={() => setOpen(true)}
      >
        <Text style={{ color: selected ? colors.text : colors.textMuted }}>{selected?.label ?? `Select ${field.relationModel}...`}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
      </TouchableOpacity>
      <PickerModal visible={open} title={field.relationModel ?? field.name} options={options} selectedId={value} searchable allowClear={!field.isRequired} onSelect={(v) => onChange(v == null ? "" : String(v))} onClose={() => setOpen(false)} />
    </View>
  );
}

// Mirrors client/src/pages/appSettings/DatabaseRowFormModal.tsx — one field per DbFieldInfo kind
// (FK picker / enum picker / boolean toggle / number / datetime text / JSON textarea / plain or
// masked-sensitive text), driven entirely by the schema registry so any of the app's ~50+ models
// works without a bespoke form.
export function DatabaseRowFormScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<MoreStackParamList, "DatabaseRowForm">>();
  const queryClient = useQueryClient();
  const { model: modelName, id } = route.params;

  const { data: registry } = useQuery({ queryKey: ["mobile-db-schema"], queryFn: async () => (await axiosClient.get("/database/schema")).data as SchemaRegistry });
  const model = registry?.models.find((m) => m.name === modelName);

  const { data: existingRow } = useQuery({
    queryKey: ["mobile-db-rows", modelName, "single", id],
    queryFn: async () => (await axiosClient.get(`/database/tables/${modelName}`, { params: { page: 1, pageSize: 1, search: id } })).data as DbListResult,
    enabled: id != null && !!model,
    select: (data) => data.rows.find((r) => String(r[model!.idField]) === id) ?? data.rows[0],
  });

  const [values, setValues] = useState<Record<string, string>>(() => ({}));
  const [initialized, setInitialized] = useState(false);
  const [enumPickerField, setEnumPickerField] = useState<DbFieldInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (model && !initialized && (id == null || existingRow)) {
    const base: Record<string, string> = {};
    for (const f of model.fields.filter((f) => f.editable)) {
      const raw = existingRow ? existingRow[f.name] : f.type === "Boolean" ? false : "";
      base[f.name] = raw === null || raw === undefined ? "" : f.type === "Json" ? (typeof raw === "string" ? raw : JSON.stringify(raw, null, 2)) : String(raw);
    }
    setValues(base);
    setInitialized(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {};
      for (const f of model!.fields.filter((f) => f.editable)) {
        const raw = values[f.name];
        if (f.isForeignKey) body[f.name] = raw === "" ? null : Number(raw);
        else if (f.type === "Boolean") body[f.name] = raw === "true";
        else if (f.type === "Int" || f.type === "Float" || f.type === "Decimal") body[f.name] = raw === "" ? null : Number(raw);
        else body[f.name] = raw;
      }
      return id != null ? axiosClient.patch(`/database/tables/${modelName}/${id}`, body) : axiosClient.post(`/database/tables/${modelName}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-db-rows", modelName] });
      queryClient.invalidateQueries({ queryKey: ["mobile-db-stats"] });
      navigation.goBack();
    },
    onError: (err: any) => setError(err?.response?.data?.error ?? "Could not save this record."),
  });

  if (!model || (id != null && !initialized)) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const labelStyle = { color: colors.textMuted, fontSize: 12, fontWeight: "700" as const, marginBottom: 6, textTransform: "uppercase" as const, marginTop: spacing.md };
  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface };
  const editableFields = model.fields.filter((f) => f.editable);

  return (
    <KeyboardAvoidingScreen>
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
      {error && (
        <View style={{ backgroundColor: colors.danger + "22", borderRadius: radius.md, padding: 12, marginBottom: spacing.md }}>
          <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text>
        </View>
      )}

      {editableFields.map((f, i) => {
        const label = `${f.name}${f.isRequired ? " *" : ""}`;
        const raw = values[f.name] ?? "";

        if (f.isForeignKey) {
          return (
            <View key={f.name}>
              <Text style={[labelStyle, i === 0 && { marginTop: 0 }]}>{label}</Text>
              <FkField field={f} value={raw} onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))} />
            </View>
          );
        }
        if (f.kind === "enum") {
          const options = registry?.enums[f.type] ?? [];
          return (
            <View key={f.name}>
              <Text style={[labelStyle, i === 0 && { marginTop: 0 }]}>{label}</Text>
              <TouchableOpacity style={{ ...inputStyle, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }} onPress={() => setEnumPickerField(f)}>
                <Text style={{ color: raw ? colors.text : colors.textMuted }}>{raw || "Select..."}</Text>
                <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
              </TouchableOpacity>
              <PickerModal
                visible={enumPickerField?.name === f.name}
                title={f.name}
                options={options.map((o) => ({ id: o, label: o }))}
                selectedId={raw}
                allowClear={!f.isRequired}
                onSelect={(v) => setValues((s) => ({ ...s, [f.name]: v == null ? "" : String(v) }))}
                onClose={() => setEnumPickerField(null)}
              />
            </View>
          );
        }
        if (f.type === "Boolean") {
          const active = raw === "true";
          return (
            <TouchableOpacity key={f.name} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.md }} onPress={() => setValues((s) => ({ ...s, [f.name]: active ? "false" : "true" }))}>
              <Ionicons name={active ? "checkbox" : "square-outline"} size={20} color={active ? colors.primary : colors.textMuted} />
              <Text style={{ color: colors.text, fontSize: 13 }}>{label}</Text>
            </TouchableOpacity>
          );
        }
        if (f.type === "Json") {
          return (
            <View key={f.name}>
              <Text style={[labelStyle, i === 0 && { marginTop: 0 }]}>{label}</Text>
              <TextInput style={{ ...inputStyle, minHeight: 100, fontFamily: "monospace", fontSize: 12, textAlignVertical: "top" }} multiline value={raw} onChangeText={(v) => setValues((s) => ({ ...s, [f.name]: v }))} />
            </View>
          );
        }
        const isSensitive = SENSITIVE_FIELD_PATTERN.test(f.name);
        return (
          <View key={f.name}>
            <Text style={[labelStyle, i === 0 && { marginTop: 0 }]}>{label}{f.type === "DateTime" ? " (ISO datetime)" : ""}</Text>
            <TextInput
              style={inputStyle}
              secureTextEntry={isSensitive}
              keyboardType={f.type === "Int" || f.type === "Float" || f.type === "Decimal" ? "numeric" : "default"}
              value={raw}
              onChangeText={(v) => setValues((s) => ({ ...s, [f.name]: v }))}
            />
          </View>
        );
      })}

      <TouchableOpacity
        style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 15, marginTop: spacing.xl, opacity: saveMutation.isPending ? 0.6 : 1 }}
        disabled={saveMutation.isPending}
        onPress={() => saveMutation.mutate()}
      >
        {saveMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>{id != null ? "Save Changes" : `New ${model.name}`}</Text>}
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAvoidingScreen>
  );
}

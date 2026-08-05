import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { RichTextEditor } from "../../components/RichTextEditor";
import { FieldSpec } from "../../lib/docsConstants";

interface Props {
  fields: FieldSpec[];
  sections: Record<string, any>;
  onChange: (key: string, value: any) => void;
}

// Mirrors client/src/pages/docs/SectionsEditor.tsx — renders the right input per field kind purely
// from the type's FieldSpec[] layout (lib/docsConstants.ts), so a 9th document type only needs a
// new registry entry, not a new form component.
export function SectionsFormEditor({ fields, sections, onChange }: Props) {
  const { colors, spacing, radius } = useTheme();
  const labelStyle = { color: colors.textMuted, fontSize: 12, fontWeight: "700" as const, marginBottom: 6, textTransform: "uppercase" as const };
  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface };

  return (
    <View style={{ gap: spacing.md }}>
      {fields.map((field) => {
        if (field.kind === "text" || field.kind === "date") {
          return (
            <View key={field.key}>
              <Text style={labelStyle}>{field.label}</Text>
              <TextInput
                style={inputStyle}
                placeholder={field.kind === "date" ? "YYYY-MM-DD" : field.placeholder}
                placeholderTextColor={colors.textMuted}
                value={sections[field.key] ?? ""}
                onChangeText={(v) => onChange(field.key, v)}
              />
            </View>
          );
        }

        if (field.kind === "textarea") {
          return (
            <View key={field.key}>
              <Text style={labelStyle}>{field.label}</Text>
              <RichTextEditor value={sections[field.key] ?? ""} onChange={(html) => onChange(field.key, html)} placeholder={field.placeholder ?? ""} />
            </View>
          );
        }

        if (field.kind !== "list") return null;

        const rows: Record<string, string>[] = sections[field.key] ?? [];
        const updateRow = (index: number, itemKey: string, value: string) => {
          onChange(field.key, rows.map((r, i) => (i === index ? { ...r, [itemKey]: value } : r)));
        };
        const addRow = () => {
          const blank = Object.fromEntries(field.itemFields.map((f) => [f.key, ""]));
          onChange(field.key, [...rows, blank]);
        };
        const removeRow = (index: number) => onChange(field.key, rows.filter((_, i) => i !== index));

        return (
          <View key={field.key}>
            <Text style={labelStyle}>{field.label}</Text>
            <View style={{ gap: spacing.sm }}>
              {rows.map((row, index) => (
                <View key={index} style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ color: colors.textMuted, fontSize: 10.5, textTransform: "uppercase", fontWeight: "700" }}>{field.label} {index + 1}</Text>
                    <TouchableOpacity onPress={() => removeRow(index)}>
                      <Ionicons name="trash-outline" size={16} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                  {field.itemFields.map((itemField) =>
                    itemField.kind === "textarea" ? (
                      <View key={itemField.key}>
                        <Text style={labelStyle}>{itemField.label}</Text>
                        <RichTextEditor value={row[itemField.key] ?? ""} onChange={(html) => updateRow(index, itemField.key, html)} minHeight={90} />
                      </View>
                    ) : (
                      <View key={itemField.key}>
                        <Text style={labelStyle}>{itemField.label}</Text>
                        <TextInput style={inputStyle} value={row[itemField.key] ?? ""} onChangeText={(v) => updateRow(index, itemField.key, v)} />
                      </View>
                    )
                  )}
                </View>
              ))}
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, alignSelf: "flex-start" }}
                onPress={addRow}
              >
                <Ionicons name="add" size={14} color={colors.text} />
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600" }}>Add {field.itemFields[0]?.label ?? "Row"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
      {sections.additionalNotes !== undefined && (
        <View>
          <Text style={labelStyle}>Additional Notes</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: 6 }}>
            Content imported from headings that didn't match a field above — review and re-file into the right section, or leave here.
          </Text>
          <RichTextEditor value={sections.additionalNotes ?? ""} onChange={(html) => onChange("additionalNotes", html)} />
        </View>
      )}
    </View>
  );
}

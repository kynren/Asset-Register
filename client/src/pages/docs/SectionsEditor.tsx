import { Icon } from "../../components/Icon";
import { RichTextEditor } from "../../components/RichTextEditor";
import { FieldSpec } from "./docsConstants";

interface SectionsEditorProps {
  fields: FieldSpec[];
  sections: Record<string, any>;
  onChange: (key: string, value: any) => void;
}

// Renders the right inputs for whichever document type is selected, purely from its FieldSpec[]
// layout (docsConstants.ts) — text/textarea/date fields bind directly to sections[key], and
// "list" fields (SOP steps, checklist items, cue sheets, etc.) get add/remove-row controls over
// an array of small objects shaped by itemFields.
export function SectionsEditor({ fields, sections, onChange }: SectionsEditorProps) {
  return (
    <div className="stack gap-3">
      {fields.map((field) => {
        if (field.kind === "text") {
          return (
            <div className="field" key={field.key}>
              <label>{field.label}</label>
              <input className="input" value={sections[field.key] ?? ""} placeholder={field.placeholder} onChange={(e) => onChange(field.key, e.target.value)} />
            </div>
          );
        }
        if (field.kind === "date") {
          return (
            <div className="field" key={field.key}>
              <label>{field.label}</label>
              <input className="input" type="date" value={sections[field.key] ?? ""} onChange={(e) => onChange(field.key, e.target.value)} />
            </div>
          );
        }
        if (field.kind === "textarea") {
          return (
            <div className="field" key={field.key}>
              <label>{field.label}</label>
              <RichTextEditor value={sections[field.key] ?? ""} onChange={(html) => onChange(field.key, html)} placeholder={field.placeholder} />
            </div>
          );
        }

        // kind === "list"
        const rows: Record<string, string>[] = sections[field.key] ?? [];
        const updateRow = (index: number, itemKey: string, value: string) => {
          const next = rows.map((r, i) => (i === index ? { ...r, [itemKey]: value } : r));
          onChange(field.key, next);
        };
        const addRow = () => {
          const blank = Object.fromEntries(field.itemFields.map((f) => [f.key, ""]));
          onChange(field.key, [...rows, blank]);
        };
        const removeRow = (index: number) => onChange(field.key, rows.filter((_, i) => i !== index));

        return (
          <div className="field" key={field.key}>
            <label>{field.label}</label>
            <div className="stack gap-2">
              {rows.map((row, index) => (
                <div key={index} className="ad-row-card" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                  <div className="row gap-2" style={{ justifyContent: "space-between" }}>
                    <span className="muted" style={{ fontSize: 11, textTransform: "uppercase" }}>{field.label} {index + 1}</span>
                    <button type="button" className="ad-btn ad-btn-danger" onClick={() => removeRow(index)}>
                      <Icon name="trash" size={12} />
                    </button>
                  </div>
                  {field.itemFields.map((itemField) =>
                    itemField.kind === "textarea" ? (
                      <div className="field" key={itemField.key} style={{ marginBottom: 0 }}>
                        <label>{itemField.label}</label>
                        <textarea className="input" rows={2} value={row[itemField.key] ?? ""} onChange={(e) => updateRow(index, itemField.key, e.target.value)} />
                      </div>
                    ) : (
                      <div className="field" key={itemField.key} style={{ marginBottom: 0 }}>
                        <label>{itemField.label}</label>
                        <input className="input" value={row[itemField.key] ?? ""} onChange={(e) => updateRow(index, itemField.key, e.target.value)} />
                      </div>
                    )
                  )}
                </div>
              ))}
              <button type="button" className="btn btn-secondary btn-sm" onClick={addRow} style={{ alignSelf: "flex-start" }}>
                <Icon name="plus" size={12} /> Add {field.itemFields[0]?.label ?? "Row"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

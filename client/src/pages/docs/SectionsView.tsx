import { FieldSpec } from "./docsConstants";

function isBlank(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

// Read-only counterpart to SectionsEditor — same FieldSpec[]-driven layout, but renders plain
// text/lists instead of inputs. Sections left empty when the document was written are skipped
// entirely rather than shown as blank headings.
export function SectionsView({ fields, sections }: { fields: FieldSpec[]; sections: Record<string, any> }) {
  const populated = fields.filter((f) => !isBlank(sections[f.key]));
  if (populated.length === 0) {
    return <div className="empty-state">This document has no content yet.</div>;
  }

  return (
    <div className="stack gap-3">
      {populated.map((field) => (
        <div key={field.key} className="ad-panel">
          <div className="ad-panel-title">{field.label}</div>
          {field.kind === "textarea" ? (
            <div className="doc-prose" dangerouslySetInnerHTML={{ __html: String(sections[field.key]) }} />
          ) : field.kind !== "list" ? (
            <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{String(sections[field.key])}</p>
          ) : (
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              {(sections[field.key] as Record<string, string>[]).map((row, index) => (
                <li key={index} style={{ marginBottom: 10 }}>
                  {field.itemFields.map((itemField) =>
                    row[itemField.key] ? (
                      <div key={itemField.key}>
                        {field.itemFields.length > 1 && <span className="muted" style={{ fontSize: 11, textTransform: "uppercase", marginRight: 6 }}>{itemField.label}:</span>}
                        <span style={{ whiteSpace: "pre-wrap" }}>{row[itemField.key]}</span>
                      </div>
                    ) : null
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}
    </div>
  );
}

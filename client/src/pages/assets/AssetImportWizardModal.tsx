import { useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";
import { Icon } from "../../components/Icon";
import { ChipSelect } from "../../components/ChipSelect";

interface TargetField {
  key: keyof Mapping;
  label: string;
  required?: boolean;
  hints: string[];
}

interface Mapping {
  assetTag?: string;
  name?: string;
  status?: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  category?: string;
  location?: string;
  assignedToName?: string;
  assignedToEmail?: string;
}

const TARGET_FIELDS: TargetField[] = [
  { key: "assetTag", label: "Asset Tag", required: true, hints: ["asset tag", "assettag", "tag", "tag number", "asset id"] },
  { key: "name", label: "Asset Name", required: true, hints: ["asset name", "name", "description", "item"] },
  { key: "status", label: "Status", hints: ["status"] },
  { key: "manufacturer", label: "Manufacturer", hints: ["manufacturer", "make", "brand"] },
  { key: "model", label: "Model", hints: ["model"] },
  { key: "serialNumber", label: "Serial Number", hints: ["serial number", "serial", "sn"] },
  { key: "category", label: "Category", hints: ["category", "type"] },
  { key: "location", label: "Location", hints: ["location", "site", "office", "building"] },
  { key: "assignedToName", label: "Assigned To — Full Name", hints: ["assigned to", "owner", "user", "employee", "full name", "assignee", "custodian"] },
  { key: "assignedToEmail", label: "Assigned To — Email", hints: ["email", "e-mail", "user email", "owner email"] },
];

function autoMap(headerRow: string[]): Mapping {
  const used = new Set<string>();
  const mapping: Mapping = {};
  for (const field of TARGET_FIELDS) {
    const match = headerRow.find((h) => {
      if (used.has(h)) return false;
      const norm = h.trim().toLowerCase();
      return field.hints.some((hint) => norm === hint || norm.includes(hint));
    });
    if (match) {
      mapping[field.key] = match;
      used.add(match);
    }
  }
  return mapping;
}

interface ImportResult {
  created: number;
  errors: string[];
  usersCreated: { id: number; email: string; firstName: string; lastName: string; tempPassword: string }[];
}

export function AssetImportWizardModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<string[][]>([]);
  const [headerRowIndex, setHeaderRowIndex] = useState(0);
  const [mapping, setMapping] = useState<Mapping>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const previewMutation = useMutation({
    mutationFn: async (f: File) => {
      const formData = new FormData();
      formData.append("file", f);
      const res = await axiosClient.post("/assets/import/preview", formData, { headers: { "Content-Type": "multipart/form-data" } });
      return res.data as { rows: string[][]; totalRows: number };
    },
    onSuccess: (data) => {
      setRows(data.rows);
      setHeaderRowIndex(0);
      setMapping(autoMap(data.rows[0] ?? []));
      setStep(2);
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file selected");
      const formData = new FormData();
      formData.append("file", file);
      formData.append("headerRowIndex", String(headerRowIndex));
      formData.append("mapping", JSON.stringify(mapping));
      const res = await axiosClient.post("/assets/import", formData, { headers: { "Content-Type": "multipart/form-data" } });
      return res.data as ImportResult;
    },
    onSuccess: () => {
      setStep(3);
      onImported();
    },
  });

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    previewMutation.mutate(f);
  }

  function updateHeaderRow(i: number) {
    setHeaderRowIndex(i);
    setMapping(autoMap(rows[i] ?? []));
  }

  const headerRow = rows[headerRowIndex] ?? [];
  const dataPreviewRows = useMemo(() => rows.slice(headerRowIndex + 1, headerRowIndex + 4), [rows, headerRowIndex]);
  const canSubmit = Boolean(mapping.assetTag && mapping.name);

  function mappedPreviewValue(row: string[], header: string | undefined) {
    if (!header) return "—";
    const i = headerRow.indexOf(header);
    return i >= 0 ? row[i] || "—" : "—";
  }

  return (
    <FormModal title="Import Assets from CSV" onClose={onClose} hideFooter maxWidth={720}>
      <div className="stack gap-3">
        {step === 1 && (
          <div className="stack gap-3">
            <p className="muted" style={{ fontSize: 13 }}>
              Choose a CSV file, then pick which row contains your column headers (useful if the file has title rows above the real header).
            </p>
            <input ref={inputRef} type="file" accept=".csv" onChange={handleFile} />
            {previewMutation.isPending && <div className="muted">Reading file...</div>}
            {previewMutation.isError && (
              <div className="alert alert-danger">{(previewMutation.error as any)?.response?.data?.error ?? "Could not read this file."}</div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="stack gap-3">
            <div>
              <h4 style={{ margin: "0 0 6px" }}>1. Which row is the header?</h4>
              <div style={{ maxHeight: 160, overflow: "auto", border: "1px solid var(--color-border)", borderRadius: 6 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr
                        key={i}
                        onClick={() => updateHeaderRow(i)}
                        style={{ cursor: "pointer", background: i === headerRowIndex ? "var(--color-primary-soft)" : undefined, borderBottom: "1px solid var(--color-border)" }}
                      >
                        <td style={{ padding: "4px 8px" }}>
                          <input type="radio" checked={i === headerRowIndex} onChange={() => updateHeaderRow(i)} />
                        </td>
                        {r.slice(0, 6).map((c, j) => (
                          <td key={j} style={{ padding: "4px 8px", whiteSpace: "nowrap" }}>{c || "—"}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4 style={{ margin: "0 0 6px" }}>2. Map columns to asset fields</h4>
              <p className="muted" style={{ fontSize: 12, margin: "0 0 8px" }}>
                We guessed a mapping from your headers — adjust anything that's wrong. If a person in "Assigned To" doesn't already
                have a user account, mapping an email column lets us create one automatically (Viewer access, temporary password)
                and assign this asset to them.
              </p>
              <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {TARGET_FIELDS.map((f) => (
                  <div key={f.key} className="field">
                    <label style={{ fontSize: 12 }}>
                      {f.label} {f.required && <span style={{ color: "var(--color-danger)" }}>*</span>}
                    </label>
                    <ChipSelect
                      value={mapping[f.key] ?? ""}
                      onChange={(v) => setMapping((m) => ({ ...m, [f.key]: v || undefined }))}
                      placeholder="-- Not mapped --"
                      options={[
                        { value: "", label: "-- Not mapped --" },
                        ...headerRow.map((h, i) => ({ value: h, label: h || `Column ${i + 1}` })),
                      ]}
                    />
                  </div>
                ))}
              </div>
            </div>

            {dataPreviewRows.length > 0 && (
              <div>
                <h4 style={{ margin: "0 0 6px" }}>3. Preview</h4>
                <div style={{ overflow: "auto", border: "1px solid var(--color-border)", borderRadius: 6 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <th style={{ padding: "4px 8px", textAlign: "left" }}>Tag</th>
                        <th style={{ padding: "4px 8px", textAlign: "left" }}>Name</th>
                        <th style={{ padding: "4px 8px", textAlign: "left" }}>Assigned To</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dataPreviewRows.map((r, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--color-border)" }}>
                          <td style={{ padding: "4px 8px" }}>{mappedPreviewValue(r, mapping.assetTag)}</td>
                          <td style={{ padding: "4px 8px" }}>{mappedPreviewValue(r, mapping.name)}</td>
                          <td style={{ padding: "4px 8px" }}>
                            {mapping.assignedToName || mapping.assignedToEmail
                              ? [mappedPreviewValue(r, mapping.assignedToName), mappedPreviewValue(r, mapping.assignedToEmail)].filter((v) => v !== "—").join(" · ") || "—"
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {importMutation.isError && (
              <div className="alert alert-danger">{(importMutation.error as any)?.response?.data?.error ?? "Import failed."}</div>
            )}

            <div className="row gap-2" style={{ justifyContent: "flex-end" }}>
              <button className="btn btn-secondary" onClick={() => { setStep(1); setFile(null); if (inputRef.current) inputRef.current.value = ""; }}>
                <Icon name="arrowLeft" size={13} /> Choose a different file
              </button>
              <button className="btn btn-primary" disabled={!canSubmit || importMutation.isPending} onClick={() => importMutation.mutate()}>
                {importMutation.isPending ? "Importing..." : "Import Assets"}
              </button>
            </div>
          </div>
        )}

        {step === 3 && importMutation.data && (
          <div className="stack gap-3">
            <div className={`alert ${importMutation.data.errors.length ? "alert-warning" : "alert-success"}`}>
              Imported {importMutation.data.created} asset(s).
              {importMutation.data.errors.length > 0 && ` ${importMutation.data.errors.length} row(s) had errors.`}
            </div>

            {importMutation.data.usersCreated.length > 0 && (
              <div>
                <h4 style={{ margin: "0 0 6px" }}>New users created from this import</h4>
                <p className="muted" style={{ fontSize: 12, margin: "0 0 8px" }}>
                  These people didn't have an account yet, so one was created and this row's asset was assigned to them.
                  Share their temporary password securely — they'll be required to change it on first login.
                </p>
                <div style={{ overflow: "auto", border: "1px solid var(--color-border)", borderRadius: 6 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <th style={{ padding: "4px 8px", textAlign: "left" }}>Name</th>
                        <th style={{ padding: "4px 8px", textAlign: "left" }}>Email</th>
                        <th style={{ padding: "4px 8px", textAlign: "left" }}>Temp Password</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importMutation.data.usersCreated.map((u) => (
                        <tr key={u.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                          <td style={{ padding: "4px 8px" }}>{u.firstName} {u.lastName}</td>
                          <td style={{ padding: "4px 8px" }}>{u.email}</td>
                          <td style={{ padding: "4px 8px", fontFamily: "monospace" }}>{u.tempPassword}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {importMutation.data.errors.length > 0 && (
              <div>
                <h4 style={{ margin: "0 0 6px" }}>Row errors</h4>
                <div style={{ maxHeight: 160, overflow: "auto" }} className="muted">
                  {importMutation.data.errors.map((e, i) => <div key={i} style={{ fontSize: 12 }}>{e}</div>)}
                </div>
              </div>
            )}

            <div className="row gap-2" style={{ justifyContent: "flex-end" }}>
              <button className="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          </div>
        )}
      </div>
    </FormModal>
  );
}

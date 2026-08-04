import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { ChipSelect } from "../../components/ChipSelect";
import { DOC_TYPES, DOC_TYPE_DESCRIPTIONS, DOC_TYPE_LABELS, DocType } from "./docsConstants";
import { DocCollectionItem } from "./CollectionsManageModal";

interface ImportOutcome {
  fileName: string;
  ok: boolean;
  docId?: number;
  unmatchedHeadings?: string[];
  error?: string;
}

// Two-step flow: pick the target document type first (so the header-matching import — see
// docImport.ts's convertDocxToSections — knows which field labels to match against), optionally
// download that type's blank template to fill in offline, then upload up to the org's configured
// limit (docsImportMaxFiles, default 5 — see docs.controller.ts's import-settings route) of
// filled-in files in one go. PDFs and files uploaded without a matched heading structure still
// land safely as a GENERAL document, same as the original single-file import did.
export function ImportDocsWizardModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [docType, setDocType] = useState<DocType>("SOP");
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<ImportOutcome[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: collections } = useQuery({
    queryKey: ["docs-collections"],
    queryFn: async () => (await axiosClient.get("/docs/collections")).data as DocCollectionItem[],
  });
  const { data: importSettings } = useQuery({
    queryKey: ["docs-import-settings"],
    queryFn: async () => (await axiosClient.get("/docs/import-settings")).data as { maxFiles: number },
  });
  const maxFiles = importSettings?.maxFiles ?? 5;

  async function downloadTemplate() {
    setDownloadingTemplate(true);
    try {
      const res = await axiosClient.get(`/docs/template/${docType}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(res.data);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = `${docType.toLowerCase()}_template.docx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } finally {
      setDownloadingTemplate(false);
    }
  }

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []).slice(0, maxFiles);
    setFiles(selected);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const importOne = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("collectionId", String(collections?.[0]?.id ?? ""));
      fd.append("docType", docType);
      return (await axiosClient.post("/docs/import", fd, { headers: { "Content-Type": "multipart/form-data" } })).data;
    },
  });

  async function handleImportAll() {
    setImporting(true);
    const outcomes: ImportOutcome[] = [];
    for (const file of files) {
      try {
        const doc = await importOne.mutateAsync(file);
        outcomes.push({ fileName: file.name, ok: true, docId: doc.id, unmatchedHeadings: doc.unmatchedHeadings ?? [] });
      } catch (err: any) {
        outcomes.push({ fileName: file.name, ok: false, error: err?.response?.data?.error ?? "Import failed" });
      }
    }
    setResults(outcomes);
    setImporting(false);
    queryClient.invalidateQueries({ queryKey: ["docs"] });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Import PDF/Word</h3>
          <button className="modal-close" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>

        {step === 1 && (
          <>
            <div className="field">
              <label>Document Type</label>
              <ChipSelect value={docType} onChange={(v) => setDocType(v as DocType)} options={DOC_TYPES.map((t) => ({ value: t, label: DOC_TYPE_LABELS[t] }))} />
              <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>{DOC_TYPE_DESCRIPTIONS[docType]}</p>
            </div>
            <p className="muted" style={{ fontSize: 12 }}>
              Word (.docx) files are matched by heading against this type's fields — download the template below, fill it in keeping the headings as-is, then upload it back. PDFs and unmatched content always import safely, just without that structure.
            </p>
            <div className="row gap-2" style={{ justifyContent: "space-between", marginTop: 16 }}>
              <button className="btn btn-secondary btn-sm" onClick={downloadTemplate} disabled={downloadingTemplate}>
                <Icon name="download" size={13} /> {downloadingTemplate ? "Downloading..." : "Download Template"}
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => setStep(2)}>Next</button>
            </div>
          </>
        )}

        {step === 2 && !results && (
          <>
            <div className="field">
              <label>Files to Import (up to {maxFiles})</label>
              <input ref={fileInputRef} type="file" accept=".pdf,.docx" multiple onChange={handleFilesSelected} />
              {files.length > 0 && (
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12 }}>
                  {files.map((f) => <li key={f.name}>{f.name}</li>)}
                </ul>
              )}
            </div>
            <div className="row gap-2" style={{ justifyContent: "space-between", marginTop: 16 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setStep(1)}>Back</button>
              <button className="btn btn-primary btn-sm" onClick={handleImportAll} disabled={files.length === 0 || importing}>
                {importing ? "Importing..." : `Import ${files.length || ""}`}
              </button>
            </div>
          </>
        )}

        {results && (
          <>
            <div className="stack gap-2">
              {results.map((r) => (
                <div key={r.fileName} className="row gap-2" style={{ alignItems: "flex-start" }}>
                  <Icon name={r.ok ? "check" : "close"} size={14} />
                  <div>
                    <div style={{ fontSize: 13 }}>
                      {r.fileName} —{" "}
                      {r.ok ? (
                        <a onClick={() => navigate(`/docs/${r.docId}`)} style={{ cursor: "pointer", color: "var(--color-primary)" }}>view document</a>
                      ) : (
                        <span className="muted">{r.error}</span>
                      )}
                    </div>
                    {r.ok && r.unmatchedHeadings && r.unmatchedHeadings.length > 0 && (
                      <div className="muted" style={{ fontSize: 11 }}>
                        Headings not matched to a field (filed under Additional Notes): {r.unmatchedHeadings.join(", ")}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="row gap-2" style={{ justifyContent: "flex-end", marginTop: 16 }}>
              <button className="btn btn-primary btn-sm" onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

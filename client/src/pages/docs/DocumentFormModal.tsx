import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";
import { SectionsEditor } from "./SectionsEditor";
import { CollectionsManageModal, DocCollectionItem } from "./CollectionsManageModal";
import { DOC_CATEGORIES, DOC_TYPES, DOC_TYPE_DESCRIPTIONS, DOC_TYPE_FIELDS, DOC_TYPE_LABELS, DocType, emptySections } from "./docsConstants";
import { ChipSelect } from "../../components/ChipSelect";
import { AccessGrantPicker, AccessLevel } from "../../components/AccessControl";

interface DocumentFull {
  id: number;
  title: string;
  docType: DocType;
  category: string;
  collectionId: number;
  summary: string | null;
  sections: Record<string, any>;
  tags: string[];
  isPublished: boolean;
  reviewDueDate: string | null;
}

export function DocumentFormModal({
  document,
  onClose,
  onCreated,
  onSaved,
}: {
  document?: DocumentFull;
  onClose: () => void;
  onCreated?: (doc: DocumentFull) => void;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(document?.title ?? "");
  const [docType, setDocType] = useState<DocType>(document?.docType ?? "SOP");
  const [category, setCategory] = useState(document?.category ?? "");
  const [collectionId, setCollectionId] = useState<number | "">(document?.collectionId ?? "");
  const [summary, setSummary] = useState(document?.summary ?? "");
  const [tagsText, setTagsText] = useState(document?.tags.join(", ") ?? "");
  const [reviewDueDate, setReviewDueDate] = useState(document?.reviewDueDate?.slice(0, 10) ?? "");
  const [isPublished, setIsPublished] = useState(document?.isPublished ?? true);
  const [sections, setSections] = useState<Record<string, any>>(document?.sections ?? emptySections("SOP"));
  const [showManageCollections, setShowManageCollections] = useState(false);
  const [newAccess, setNewAccess] = useState<{ userId?: string; teamId?: string; level: AccessLevel }[]>([]);

  const { data: users } = useQuery({ queryKey: ["users-directory"], queryFn: async () => (await axiosClient.get("/users/directory")).data });
  const { data: teams } = useQuery({ queryKey: ["teams-directory"], queryFn: async () => (await axiosClient.get("/teams/directory")).data });

  const { data: existingCategories } = useQuery({
    queryKey: ["docs-categories"],
    queryFn: async () => (await axiosClient.get("/docs/categories")).data as string[],
  });
  const categoryOptions = [...new Set([...DOC_CATEGORIES, ...(existingCategories ?? [])])];

  const { data: collections } = useQuery({
    queryKey: ["docs-collections"],
    queryFn: async () => (await axiosClient.get("/docs/collections")).data as DocCollectionItem[],
  });

  function handleDocTypeChange(next: DocType) {
    setDocType(next);
    setSections(emptySections(next));
  }

  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

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

  function updateSection(key: string, value: any) {
    setSections((s) => ({ ...s, [key]: value }));
  }

  const payload = {
    title,
    category,
    collectionId: collectionId === "" ? undefined : collectionId,
    summary: summary || undefined,
    sections,
    tags: tagsText.split(",").map((t) => t.trim()).filter(Boolean),
    isPublished,
    reviewDueDate: reviewDueDate ? new Date(reviewDueDate).toISOString() : null,
  };

  const mutation = useMutation({
    mutationFn: async () =>
      document
        ? (await axiosClient.patch(`/docs/${document.id}`, payload)).data as DocumentFull
        : (await axiosClient.post("/docs", { ...payload, docType, access: newAccess.map((a) => (a.userId != null ? { userId: Number(a.userId), level: a.level } : { teamId: Number(a.teamId), level: a.level })) })).data as DocumentFull,
    onSuccess: (doc) => {
      queryClient.invalidateQueries({ queryKey: ["docs"] });
      queryClient.invalidateQueries({ queryKey: ["doc", doc.id] });
      if (document) onSaved?.();
      else onCreated?.(doc);
    },
  });

  return (
    <FormModal
      title={document ? `Edit — ${document.title}` : "New Document"}
      onClose={onClose}
      onSubmit={() => mutation.mutate()}
      submitting={mutation.isPending}
      submitDisabled={!title.trim() || !category.trim() || collectionId === ""}
      submitLabel={document ? "Save" : "Create Document"}
      maxWidth={760}
    >
      {mutation.isError && <div className="alert alert-danger">{(mutation.error as any)?.response?.data?.error ?? "Something went wrong."}</div>}

      <div className="field">
        <label>Document Type</label>
        {document ? (
          <input className="input" value={DOC_TYPE_LABELS[docType]} disabled />
        ) : (
          <>
            <ChipSelect
              value={docType}
              onChange={(v) => handleDocTypeChange(v as DocType)}
              options={DOC_TYPES.map((t) => ({ value: t, label: DOC_TYPE_LABELS[t] }))}
            />
            <div className="row gap-2" style={{ alignItems: "flex-start", justifyContent: "space-between", marginTop: 4 }}>
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>{DOC_TYPE_DESCRIPTIONS[docType]}</p>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ whiteSpace: "nowrap", flexShrink: 0 }}
                onClick={downloadTemplate}
                disabled={downloadingTemplate}
                title="Download a blank Word template for this document type, to fill in offline and import back"
              >
                {downloadingTemplate ? "Downloading..." : "Download Template"}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-2">
        <div className="field">
          <label>Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Hydraulic Lift Daily Startup" autoFocus />
        </div>
        <div className="field">
          <label>Category</label>
          <input className="input" list="doc-categories" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Hydraulics" />
          <datalist id="doc-categories">
            {categoryOptions.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
      </div>

      <div className="field">
        <label>Collection</label>
        <div className="row gap-2">
          <ChipSelect
            value={String(collectionId)}
            onChange={(v) => setCollectionId(v ? Number(v) : "")}
            placeholder="Select a collection…"
            options={[{ value: "", label: "Select a collection…" }, ...(collections ?? []).map((c) => ({ value: String(c.id), label: c.name }))]}
          />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowManageCollections(true)} style={{ whiteSpace: "nowrap" }}>
            Manage
          </button>
        </div>
        {(collections ?? []).length === 0 && (
          <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>No collections yet — every document belongs to one, click Manage to create the first.</p>
        )}
      </div>

      <div className="field">
        <label>Summary (shown in search results)</label>
        <input className="input" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="One-line description" />
      </div>

      <div className="grid grid-cols-2">
        <div className="field">
          <label>Tags (comma-separated)</label>
          <input className="input" value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="e.g. lift, startup, safety" />
        </div>
        <div className="field">
          <label>Review Due Date (optional)</label>
          <input className="input" type="date" value={reviewDueDate} onChange={(e) => setReviewDueDate(e.target.value)} />
        </div>
      </div>

      <label className="row gap-2" style={{ cursor: "pointer", marginBottom: 16 }}>
        <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
        Published (visible to everyone with view access — uncheck to keep as a draft)
      </label>

      <hr style={{ border: "none", borderTop: "1px solid var(--color-border)", margin: "0 0 16px" }} />

      <SectionsEditor fields={DOC_TYPE_FIELDS[docType]} sections={sections} onChange={updateSection} />

      {!document && (
        <>
          <hr style={{ border: "none", borderTop: "1px solid var(--color-border)", margin: "16px 0" }} />
          <AccessGrantPicker users={users ?? []} teams={teams ?? []} value={newAccess} onChange={setNewAccess} levels={["EDIT", "DELETE", "DUPLICATE"]} />
        </>
      )}

      {showManageCollections && <CollectionsManageModal onClose={() => setShowManageCollections(false)} />}
    </FormModal>
  );
}

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, DragEndEvent, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";
import { Icon } from "../../components/Icon";
import { EVENT_LABELS, EVENT_VARIABLES, EmailBlock, EmailEventType, SAMPLE_VARIABLES, interpolatePreview } from "./emailTemplateConstants";

interface EmailTemplateFull {
  id: number;
  name: string;
  eventType: EmailEventType;
  subject: string;
  blocks: EmailBlock[];
}

const BLOCK_TYPES: { type: EmailBlock["type"]; label: string; icon: string }[] = [
  { type: "heading", label: "Heading", icon: "fileText" },
  { type: "text", label: "Text", icon: "fileText" },
  { type: "image", label: "Image", icon: "camera" },
  { type: "button", label: "Button", icon: "diamond" },
  { type: "divider", label: "Divider", icon: "grid" },
  { type: "spacer", label: "Spacer", icon: "maximize" },
];

function newBlock(type: EmailBlock["type"]): EmailBlock {
  const id = `b${Date.now()}${Math.round(Math.random() * 1000)}`;
  switch (type) {
    case "heading":
      return { id, type, text: "Heading text", align: "left" };
    case "text":
      return { id, type, text: "Write your message here. Use {{variables}} to personalize it.", align: "left" };
    case "image":
      return { id, type, url: "", alt: "", align: "center" };
    case "button":
      return { id, type, text: "View Details", url: "{{assetUrl}}", color: "#7e14ff" };
    case "divider":
      return { id, type };
    case "spacer":
      return { id, type, height: 24 };
  }
}

export function EmailTemplateBuilderModal({ templateId, onClose }: { templateId: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const { data: template } = useQuery({
    queryKey: ["email-template", templateId],
    queryFn: async () => (await axiosClient.get(`/email-templates/${templateId}`)).data as EmailTemplateFull,
  });

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [blocks, setBlocks] = useState<EmailBlock[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    if (template && !hydrated.current) {
      setName(template.name);
      setSubject(template.subject);
      setBlocks(template.blocks ?? []);
      hydrated.current = true;
    }
  }, [template]);

  const saveMutation = useMutation({
    mutationFn: () => axiosClient.patch(`/email-templates/${templateId}`, { name, subject, blocks }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-template", templateId] });
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
    },
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return axiosClient.post("/email-templates/images", fd, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: (res) => {
      if (uploadingFor) updateBlock(uploadingFor, { url: res.data.url } as Partial<EmailBlock>);
      setUploadingFor(null);
    },
  });

  function addBlock(type: EmailBlock["type"]) {
    const block = newBlock(type);
    setBlocks((b) => [...b, block]);
    setSelectedId(block.id);
  }

  function updateBlock(id: string, patch: Partial<EmailBlock>) {
    setBlocks((bs) => bs.map((b) => (b.id === id ? ({ ...b, ...patch } as EmailBlock) : b)));
  }

  function removeBlock(id: string) {
    setBlocks((bs) => bs.filter((b) => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setBlocks((bs) => {
      const oldIndex = bs.findIndex((b) => b.id === active.id);
      const newIndex = bs.findIndex((b) => b.id === over.id);
      return arrayMove(bs, oldIndex, newIndex);
    });
  }

  if (!template) return null;

  const variables = EVENT_VARIABLES[template.eventType];
  const sampleValues = SAMPLE_VARIABLES[template.eventType];
  const selectedBlock = blocks.find((b) => b.id === selectedId) ?? null;

  return (
    <FormModal title={`Design — ${name || template.name}`} onClose={onClose} hideFooter maxWidth={1080}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadMutation.mutate(file);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
      />

      <div className="row gap-2" style={{ alignItems: "flex-start", marginBottom: 12 }}>
        <span className="badge badge-neutral">{EVENT_LABELS[template.eventType]}</span>
        {saveMutation.isSuccess && <span className="badge badge-success">Saved</span>}
      </div>

      <div className="grid grid-cols-2" style={{ gap: 12, marginBottom: 12 }}>
        <div className="field">
          <label>Template Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Subject Line</label>
          <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
      </div>

      <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
        Available variables for this event:{" "}
        {variables.map((v) => (
          <code key={v} style={{ marginRight: 6, background: "var(--color-bg)", padding: "2px 6px", borderRadius: 4 }}>{`{{${v}}}`}</code>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 340px", gap: 16, alignItems: "start" }}>
        {/* Block palette */}
        <div className="stack gap-1">
          <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", marginBottom: 2 }}>Add Block</div>
          {BLOCK_TYPES.map((bt) => (
            <button key={bt.type} className="btn btn-secondary btn-sm" style={{ justifyContent: "flex-start" }} onClick={() => addBlock(bt.type)}>
              <Icon name={bt.icon} size={13} /> {bt.label}
            </button>
          ))}
        </div>

        {/* Block list (drag to reorder) + editor */}
        <div className="stack gap-2">
          {blocks.length === 0 ? (
            <div className="ad-empty">No blocks yet — add one from the left to start designing.</div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                <div className="stack gap-2">
                  {blocks.map((b) => (
                    <SortableBlockRow key={b.id} block={b} selected={b.id === selectedId} onSelect={() => setSelectedId(b.id)} onDelete={() => removeBlock(b.id)} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {selectedBlock && (
            <BlockEditor
              block={selectedBlock}
              variables={variables}
              onChange={(patch) => updateBlock(selectedBlock.id, patch)}
              onUploadImage={() => { setUploadingFor(selectedBlock.id); fileInputRef.current?.click(); }}
              uploading={uploadMutation.isPending && uploadingFor === selectedBlock.id}
            />
          )}
        </div>

        {/* Live preview */}
        <div>
          <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", marginBottom: 6 }}>Preview</div>
          <div style={{ background: "#f4f4f7", borderRadius: 8, padding: 12, maxHeight: 520, overflowY: "auto" }}>
            <div style={{ background: "#ffffff", borderRadius: 8, overflow: "hidden" }}>
              {blocks.map((b) => (
                <PreviewBlock key={b.id} block={b} variables={sampleValues} />
              ))}
              {blocks.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "#999", fontSize: 13 }}>Nothing to preview yet.</div>}
            </div>
          </div>
        </div>
      </div>

      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
        <button className="btn btn-primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? "Saving..." : "Save Design"}
        </button>
      </div>
    </FormModal>
  );
}

function SortableBlockRow({ block, selected, onSelect, onDelete }: { block: EmailBlock; selected: boolean; onSelect: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const label = BLOCK_TYPES.find((bt) => bt.type === block.type)?.label ?? block.type;
  const summary =
    block.type === "heading" || block.type === "text" ? block.text :
    block.type === "image" ? (block.url ? "Image set" : "No image chosen") :
    block.type === "button" ? block.text :
    block.type === "spacer" ? `${block.height ?? 24}px` : "";

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, border: selected ? "1px solid var(--color-primary)" : "1px solid var(--color-border)" }}
      className="ad-row-card"
      onClick={onSelect}
    >
      <div className="row gap-2">
        <button className="widget-drag-handle" {...attributes} {...listeners} title="Drag to reorder" onClick={(e) => e.stopPropagation()}>
          <Icon name="grid" size={13} />
        </button>
        <div>
          <div className="ad-row-value">{label}</div>
          {summary && <div className="ad-row-label" style={{ textTransform: "none" }}>{summary}</div>}
        </div>
      </div>
      <button className="ad-btn ad-btn-danger" onClick={(e) => { e.stopPropagation(); onDelete(); }}><Icon name="trash" size={12} /></button>
    </div>
  );
}

function BlockEditor({
  block,
  variables,
  onChange,
  onUploadImage,
  uploading,
}: {
  block: EmailBlock;
  variables: string[];
  onChange: (patch: Partial<EmailBlock>) => void;
  onUploadImage: () => void;
  uploading: boolean;
}) {
  return (
    <div className="ad-panel">
      {(block.type === "heading" || block.type === "text") && (
        <>
          <div className="field">
            <label>Text</label>
            <textarea className="input" rows={block.type === "heading" ? 2 : 4} value={block.text} onChange={(e) => onChange({ text: e.target.value } as Partial<EmailBlock>)} />
          </div>
          <div className="field">
            <label>Alignment</label>
            <select className="select" value={block.align ?? "left"} onChange={(e) => onChange({ align: e.target.value } as Partial<EmailBlock>)}>
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </div>
        </>
      )}

      {block.type === "image" && (
        <>
          <div className="field">
            <label>Image</label>
            <div className="row gap-2" style={{ alignItems: "center" }}>
              {block.url && <img src={block.url} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6 }} />}
              <button className="btn btn-secondary btn-sm" onClick={onUploadImage} disabled={uploading}>
                {uploading ? "Uploading..." : block.url ? "Replace Image" : "Upload Image"}
              </button>
            </div>
          </div>
          <div className="field">
            <label>Alt Text</label>
            <input className="input" value={block.alt ?? ""} onChange={(e) => onChange({ alt: e.target.value } as Partial<EmailBlock>)} />
          </div>
          <div className="field">
            <label>Width (px, optional)</label>
            <input className="input" type="number" value={block.width ?? ""} onChange={(e) => onChange({ width: e.target.value ? Number(e.target.value) : undefined } as Partial<EmailBlock>)} />
          </div>
        </>
      )}

      {block.type === "button" && (
        <>
          <div className="field">
            <label>Button Text</label>
            <input className="input" value={block.text} onChange={(e) => onChange({ text: e.target.value } as Partial<EmailBlock>)} />
          </div>
          <div className="field">
            <label>Link URL</label>
            <input className="input" value={block.url} onChange={(e) => onChange({ url: e.target.value } as Partial<EmailBlock>)} placeholder="{{assetUrl}}" />
          </div>
          <div className="field">
            <label>Color</label>
            <input className="input" type="color" value={block.color ?? "#7e14ff"} onChange={(e) => onChange({ color: e.target.value } as Partial<EmailBlock>)} style={{ height: 36, padding: 2 }} />
          </div>
        </>
      )}

      {block.type === "spacer" && (
        <div className="field">
          <label>Height (px)</label>
          <input className="input" type="number" value={block.height ?? 24} onChange={(e) => onChange({ height: Number(e.target.value) } as Partial<EmailBlock>)} />
        </div>
      )}

      {block.type === "divider" && <p className="muted" style={{ fontSize: 12 }}>A horizontal divider line — nothing to configure.</p>}

      {(block.type === "heading" || block.type === "text" || block.type === "button") && variables.length > 0 && (
        <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>
          Insert a variable by typing it, e.g. <code>{`{{${variables[0]}}}`}</code>
        </p>
      )}
    </div>
  );
}

function PreviewBlock({ block, variables }: { block: EmailBlock; variables: Record<string, string> }) {
  switch (block.type) {
    case "heading":
      return (
        <div style={{ padding: "20px 24px 8px", textAlign: block.align ?? "left" }}>
          <h2 style={{ margin: 0, fontFamily: "Arial, Helvetica, sans-serif", fontSize: 22, color: "#1a1a2e", whiteSpace: "pre-wrap" }}>
            {interpolatePreview(block.text, variables)}
          </h2>
        </div>
      );
    case "text":
      return (
        <div style={{ padding: "8px 24px", textAlign: block.align ?? "left", fontFamily: "Arial, Helvetica, sans-serif", fontSize: 14, lineHeight: 1.6, color: "#333", whiteSpace: "pre-wrap" }}>
          {interpolatePreview(block.text, variables)}
        </div>
      );
    case "image":
      return (
        <div style={{ padding: "8px 24px", textAlign: block.align ?? "center" }}>
          {block.url ? (
            <img src={interpolatePreview(block.url, variables)} alt={block.alt ?? ""} width={block.width} style={{ maxWidth: "100%", height: "auto" }} />
          ) : (
            <div style={{ padding: 24, background: "#f4f4f7", color: "#999", fontSize: 12, borderRadius: 6 }}>No image chosen</div>
          )}
        </div>
      );
    case "button":
      return (
        <div style={{ padding: "20px 24px", textAlign: "center" }}>
          <span style={{ background: block.color ?? "#7e14ff", color: "#fff", padding: "12px 28px", borderRadius: 6, fontFamily: "Arial, Helvetica, sans-serif", fontSize: 14, fontWeight: 600, display: "inline-block" }}>
            {interpolatePreview(block.text, variables)}
          </span>
        </div>
      );
    case "divider":
      return (
        <div style={{ padding: "8px 24px" }}>
          <hr style={{ border: "none", borderTop: "1px solid #e2e2e2", margin: 0 }} />
        </div>
      );
    case "spacer":
      return <div style={{ height: block.height ?? 24 }} />;
  }
}

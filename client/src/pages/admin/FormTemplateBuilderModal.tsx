import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, DragEndEvent, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";
import { Icon } from "../../components/Icon";

const FIELD_TYPES = [
  { value: "TEXT", label: "Text" },
  { value: "TEXTAREA", label: "Text Area" },
  { value: "NUMBER", label: "Number" },
  { value: "DATE", label: "Date" },
  { value: "SELECT", label: "Dropdown" },
  { value: "CHECKBOX", label: "Checkbox" },
];

interface TemplateField {
  id: number;
  label: string;
  fieldType: string;
  required: boolean;
  options: string[] | null;
  order: number;
}

function typeLabel(value: string) {
  return FIELD_TYPES.find((t) => t.value === value)?.label ?? value;
}

function SortableFieldRow({ field, onEdit, onDelete }: { field: TemplateField; onEdit: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="ad-row-card">
      <div className="row gap-2">
        <button className="widget-drag-handle" {...attributes} {...listeners} title="Drag to reorder">
          <Icon name="grid" size={13} />
        </button>
        <div>
          <div className="ad-row-value">
            {field.label}
            {field.required && <span className="ad-badge ad-badge-warning" style={{ marginLeft: 8 }}>Required</span>}
          </div>
          <div className="ad-row-label" style={{ textTransform: "none" }}>
            {typeLabel(field.fieldType)}
            {field.fieldType === "SELECT" && field.options?.length ? ` · ${field.options.join(", ")}` : ""}
          </div>
        </div>
      </div>
      <div className="row gap-1">
        <button className="ad-btn" onClick={onEdit}><Icon name="edit" size={12} /></button>
        <button className="ad-btn ad-btn-danger" onClick={onDelete}><Icon name="trash" size={12} /></button>
      </div>
    </div>
  );
}

export function FormTemplateBuilderModal({ templateId, templateName, onClose }: { templateId: number; templateName: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const { data: template } = useQuery({
    queryKey: ["asset-form-template", templateId],
    queryFn: async () => (await axiosClient.get(`/asset-form-templates/${templateId}`)).data as { fields: TemplateField[] },
  });

  const [fields, setFields] = useState<TemplateField[]>([]);
  useEffect(() => {
    if (template?.fields) setFields(template.fields);
  }, [template]);

  const [editingField, setEditingField] = useState<TemplateField | null>(null);
  const [showFieldForm, setShowFieldForm] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["asset-form-template", templateId] });
    queryClient.invalidateQueries({ queryKey: ["asset-form-templates"] });
  };

  const reorderMutation = useMutation({
    mutationFn: (orderedFieldIds: number[]) => axiosClient.patch(`/asset-form-templates/${templateId}/fields/reorder`, { orderedFieldIds }),
    onSuccess: invalidate,
  });

  const deleteFieldMutation = useMutation({
    mutationFn: (fieldId: number) => axiosClient.delete(`/asset-form-templates/${templateId}/fields/${fieldId}`),
    onSuccess: invalidate,
  });

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = fields.findIndex((f) => f.id === active.id);
    const newIndex = fields.findIndex((f) => f.id === over.id);
    const reordered = arrayMove(fields, oldIndex, newIndex);
    setFields(reordered);
    reorderMutation.mutate(reordered.map((f) => f.id));
  }

  return (
    <FormModal title={`Form Fields — ${templateName}`} onClose={onClose} hideFooter maxWidth={620}>
      <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>
        Drag fields to reorder them. This order is what staff see on the Add/Edit Asset form for any category linked to this template.
      </p>

      {fields.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
            <div className="stack gap-2" style={{ marginBottom: 16 }}>
              {fields.map((f) => (
                <SortableFieldRow
                  key={f.id}
                  field={f}
                  onEdit={() => { setEditingField(f); setShowFieldForm(true); }}
                  onDelete={() => deleteFieldMutation.mutate(f.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="ad-empty" style={{ marginBottom: 16 }}>No fields yet. Add the first one below.</div>
      )}

      {showFieldForm ? (
        <FieldEditor
          templateId={templateId}
          field={editingField}
          onDone={() => { setShowFieldForm(false); setEditingField(null); invalidate(); }}
          onCancel={() => { setShowFieldForm(false); setEditingField(null); }}
        />
      ) : (
        <button className="btn btn-primary btn-sm" onClick={() => setShowFieldForm(true)}>
          <Icon name="plus" size={13} /> Add Field
        </button>
      )}

      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
      </div>
    </FormModal>
  );
}

function FieldEditor({
  templateId,
  field,
  onDone,
  onCancel,
}: {
  templateId: number;
  field: TemplateField | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(field?.label ?? "");
  const [fieldType, setFieldType] = useState(field?.fieldType ?? "TEXT");
  const [required, setRequired] = useState(field?.required ?? false);
  const [optionsText, setOptionsText] = useState(field?.options?.join(", ") ?? "");

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        label,
        fieldType,
        required,
        options: fieldType === "SELECT" ? optionsText.split(",").map((o) => o.trim()).filter(Boolean) : undefined,
      };
      return field
        ? axiosClient.patch(`/asset-form-templates/${templateId}/fields/${field.id}`, payload)
        : axiosClient.post(`/asset-form-templates/${templateId}/fields`, payload);
    },
    onSuccess: onDone,
  });

  return (
    <div className="ad-panel">
      {mutation.isError && <div className="alert alert-danger">{(mutation.error as any)?.response?.data?.error ?? "Something went wrong."}</div>}
      <div className="grid grid-cols-2">
        <div className="field">
          <label>Field Label</label>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Chassis Serial" autoFocus />
        </div>
        <div className="field">
          <label>Field Type</label>
          <select className="select" value={fieldType} onChange={(e) => setFieldType(e.target.value)}>
            {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>
      {fieldType === "SELECT" && (
        <div className="field">
          <label>Options (comma-separated)</label>
          <input className="input" value={optionsText} onChange={(e) => setOptionsText(e.target.value)} placeholder="e.g. Rack, Tower, Blade" />
        </div>
      )}
      <label className="row gap-2" style={{ cursor: "pointer", marginBottom: 12 }}>
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
        Required field
      </label>
      <div className="row gap-2">
        <button className="btn btn-primary btn-sm" disabled={!label.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
          {field ? "Save Field" : "Add Field"}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

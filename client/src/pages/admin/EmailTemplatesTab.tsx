import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { DataTable } from "../../components/DataTable";
import { FormModal } from "../../components/FormModal";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmailTemplateBuilderModal } from "./EmailTemplateBuilderModal";
import { EmailEventType, EVENT_DESCRIPTIONS, EVENT_LABELS, EVENT_TYPES } from "./emailTemplateConstants";
import { PermissionGate } from "../../auth/PermissionGate";

interface EmailTemplate {
  id: number;
  name: string;
  eventType: EmailEventType;
  subject: string;
  isActive: boolean;
  updatedAt: string;
  createdBy: { firstName: string; lastName: string } | null;
}

export function EmailTemplatesTab() {
  const [eventFilter, setEventFilter] = useState<EmailEventType | "">("");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [testing, setTesting] = useState<EmailTemplate | null>(null);
  const [deleting, setDeleting] = useState<EmailTemplate | null>(null);
  const queryClient = useQueryClient();

  const { data: templates, isLoading } = useQuery({
    queryKey: ["email-templates", eventFilter],
    queryFn: async () => (await axiosClient.get("/email-templates", { params: eventFilter ? { eventType: eventFilter } : undefined })).data as EmailTemplate[],
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["email-templates"] });
  }

  const activateMutation = useMutation({
    mutationFn: (id: number) => axiosClient.patch(`/email-templates/${id}/activate`),
    onSuccess: invalidate,
  });
  const deactivateMutation = useMutation({
    mutationFn: (id: number) => axiosClient.patch(`/email-templates/${id}/deactivate`),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/email-templates/${id}`),
    onSuccess: () => { invalidate(); setDeleting(null); },
  });
  const duplicateMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`/email-templates/${id}/duplicate`),
    onSuccess: invalidate,
  });

  const columns: ColumnDef<EmailTemplate, any>[] = [
    { header: "Name", accessorKey: "name" },
    { header: "Event", cell: ({ row }) => <span className="badge badge-neutral">{EVENT_LABELS[row.original.eventType]}</span> },
    { header: "Subject", accessorKey: "subject" },
    {
      header: "Status",
      cell: ({ row }) =>
        row.original.isActive ? (
          <span className="badge badge-success">Active</span>
        ) : (
          <span className="badge badge-neutral">Inactive</span>
        ),
    },
    { header: "Last Modified", accessorFn: (r) => dayjs(r.updatedAt).format("DD MMM YYYY, HH:mm") },
    {
      header: "",
      id: "actions",
      cell: ({ row }) => (
        <div className="row gap-1">
          <PermissionGate module="admin" action="edit">
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing(row.original)}>
              <Icon name="wand" size={12} /> Design
            </button>
            {row.original.isActive ? (
              <button className="btn btn-secondary btn-sm" onClick={() => deactivateMutation.mutate(row.original.id)}>
                Deactivate
              </button>
            ) : (
              <button className="btn btn-secondary btn-sm" onClick={() => activateMutation.mutate(row.original.id)}>
                Activate
              </button>
            )}
            <button className="btn btn-secondary btn-sm btn-icon" title="Send test email" onClick={() => setTesting(row.original)}>
              <Icon name="mail" size={12} />
            </button>
          </PermissionGate>
          <PermissionGate module="admin" action="create">
            <button className="btn btn-secondary btn-sm btn-icon" title="Duplicate" onClick={() => duplicateMutation.mutate(row.original.id)}>
              <Icon name="paperclip" size={12} />
            </button>
          </PermissionGate>
          <PermissionGate module="admin" action="delete">
            <button className="btn btn-danger btn-sm btn-icon" onClick={() => setDeleting(row.original)}>
              <Icon name="trash" size={13} />
            </button>
          </PermissionGate>
        </div>
      ),
    },
  ];

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <h3 className="mt-0 mb-0">Email Templates</h3>
          <p className="muted" style={{ fontSize: 12, margin: "2px 0 0" }}>
            Design the emails sent for account creation, asset assignment, overdue tasks, low stock, and password
            resets. Only one template can be active per event at a time.
          </p>
        </div>
        <PermissionGate module="admin" action="create">
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
            <Icon name="plus" size={13} /> New Template
          </button>
        </PermissionGate>
      </div>

      <div className="row gap-2" style={{ marginBottom: 12 }}>
        <select className="select" style={{ maxWidth: 220 }} value={eventFilter} onChange={(e) => setEventFilter(e.target.value as EmailEventType | "")}>
          <option value="">All Events</option>
          {EVENT_TYPES.map((e) => (
            <option key={e} value={e}>{EVENT_LABELS[e]}</option>
          ))}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={templates ?? []}
        isLoading={isLoading}
        clientPageSize={10}
        emptyMessage="No email templates yet — until you create and activate one for an event, a plain built-in email is used instead."
      />

      {showCreate && (
        <CreateTemplateModal
          onClose={() => setShowCreate(false)}
          onCreated={(created) => { setShowCreate(false); invalidate(); setEditing(created); }}
        />
      )}

      {editing && <EmailTemplateBuilderModal templateId={editing.id} onClose={() => { setEditing(null); invalidate(); }} />}

      {testing && <SendTestModal template={testing} onClose={() => setTesting(null)} />}

      {deleting && (
        <ConfirmDialog
          title="Delete email template"
          message={`Are you sure you want to delete "${deleting.name}"? This cannot be undone.`}
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      )}
    </div>
  );
}

function CreateTemplateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (template: EmailTemplate) => void }) {
  const [name, setName] = useState("");
  const [eventType, setEventType] = useState<EmailEventType>("ACCOUNT_CREATED");
  const [subject, setSubject] = useState("");

  const mutation = useMutation({
    mutationFn: async () => (await axiosClient.post("/email-templates", { name, eventType, subject, blocks: [] })).data as EmailTemplate,
    onSuccess: onCreated,
  });

  return (
    <FormModal
      title="New Email Template"
      onClose={onClose}
      onSubmit={() => mutation.mutate()}
      submitting={mutation.isPending}
      submitDisabled={!name.trim() || !subject.trim()}
      submitLabel="Create & Design"
    >
      {mutation.isError && <div className="alert alert-danger">{(mutation.error as any)?.response?.data?.error ?? "Something went wrong."}</div>}
      <div className="field">
        <label>Template Name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New Hire Welcome" autoFocus />
      </div>
      <div className="field">
        <label>Event</label>
        <select className="select" value={eventType} onChange={(e) => setEventType(e.target.value as EmailEventType)}>
          {EVENT_TYPES.map((e) => (
            <option key={e} value={e}>{EVENT_LABELS[e]}</option>
          ))}
        </select>
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>{EVENT_DESCRIPTIONS[eventType]}</p>
      </div>
      <div className="field">
        <label>Subject Line</label>
        <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Welcome to Kynren Asset Register, {{firstName}}!" />
      </div>
    </FormModal>
  );
}

function SendTestModal({ template, onClose }: { template: EmailTemplate; onClose: () => void }) {
  const [to, setTo] = useState("");

  const mutation = useMutation({
    mutationFn: () => axiosClient.post(`/email-templates/${template.id}/test`, { to }),
    onSuccess: onClose,
  });

  return (
    <FormModal
      title={`Send Test — ${template.name}`}
      onClose={onClose}
      onSubmit={() => mutation.mutate()}
      submitting={mutation.isPending}
      submitDisabled={!to.trim()}
      submitLabel="Send Test Email"
    >
      {mutation.isError && <div className="alert alert-danger">{(mutation.error as any)?.response?.data?.error ?? "Something went wrong."}</div>}
      <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>
        Sends this design with realistic sample data — not a real notification, just a preview in your inbox.
      </p>
      <div className="field">
        <label>Send To</label>
        <input className="input" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@kynren.com" autoFocus />
      </div>
    </FormModal>
  );
}

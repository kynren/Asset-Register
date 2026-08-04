import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import { axiosClient } from "../../api/axiosClient";
import { DataTable } from "../../components/DataTable";
import { Icon } from "../../components/Icon";
import { useToast, type ToastVariant } from "../../components/toast/ToastProvider";
import { ChipSelect } from "../../components/ChipSelect";
import { NOTIFICATION_TYPES, NotificationTypeInfo } from "../../lib/notificationTypes";
import { PermissionGate, usePermission } from "../../auth/PermissionGate";

interface ToastSettingItem {
  id: number | null;
  type: string;
  isEnabled: boolean | null;
  variant: ToastVariant | null;
  title: string | null;
  message: string | null;
}

interface Draft {
  isEnabled: boolean;
  variant: ToastVariant;
  title: string;
  message: string;
}

const VARIANT_OPTIONS: ToastVariant[] = ["info", "success", "warning", "error"];

function draftFromSaved(info: NotificationTypeInfo, saved: ToastSettingItem | undefined): Draft {
  // saved.id is null for a type nobody has customized yet (see toastSettings.routes.ts padding) —
  // fall back to the catalog defaults rather than diffing against that null placeholder.
  return {
    isEnabled: saved?.id != null ? saved.isEnabled ?? true : true,
    variant: (saved?.id != null ? saved.variant : null) ?? info.defaultVariant,
    title: (saved?.id != null ? saved.title : null) ?? "",
    message: (saved?.id != null ? saved.message : null) ?? "",
  };
}

export function ToastSettingsTab() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const canEdit = usePermission("admin", "edit");

  const { data } = useQuery({
    queryKey: ["toast-settings"],
    queryFn: async () => (await axiosClient.get("/toast-settings")).data as ToastSettingItem[],
  });

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  // Seed each row's draft from the server once it's loaded, without clobbering a row the user is
  // already mid-edit on (e.g. a background refetch after saving a different row).
  useEffect(() => {
    if (!data) return;
    setDrafts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const info of NOTIFICATION_TYPES) {
        if (next[info.type]) continue;
        next[info.type] = draftFromSaved(info, data.find((s) => s.type === info.type));
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [data]);

  function updateDraft(type: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [type]: { ...prev[type], ...patch } }));
  }

  const saveMutation = useMutation({
    mutationFn: ({ type, draft }: { type: string; draft: Draft }) =>
      axiosClient.patch(`/toast-settings/${type}`, {
        isEnabled: draft.isEnabled,
        variant: draft.variant,
        title: draft.title || null,
        message: draft.message || null,
      }),
    meta: { successMessage: "Toast settings saved" },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["toast-settings"] }),
  });

  function isDirty(info: NotificationTypeInfo, draft: Draft | undefined) {
    if (!draft) return false;
    const baseline = draftFromSaved(info, data?.find((s) => s.type === info.type));
    return (
      draft.isEnabled !== baseline.isEnabled ||
      draft.variant !== baseline.variant ||
      draft.title !== baseline.title ||
      draft.message !== baseline.message
    );
  }

  const columns: ColumnDef<NotificationTypeInfo, any>[] = useMemo(
    () => [
      {
        header: "Notification",
        accessorKey: "label",
        meta: { cardTitle: true },
        cell: ({ row }) => (
          <div>
            <div style={{ fontWeight: 600 }}>{row.original.label}</div>
            <div className="muted" style={{ fontSize: 12 }}>{row.original.description}</div>
          </div>
        ),
      },
      {
        header: "Enabled",
        id: "enabled",
        cell: ({ row }) => {
          const draft = drafts[row.original.type];
          if (!draft) return null;
          return (
            <input
              type="checkbox"
              checked={draft.isEnabled}
              disabled={!canEdit}
              onChange={(e) => updateDraft(row.original.type, { isEnabled: e.target.checked })}
            />
          );
        },
      },
      {
        header: "Variant",
        id: "variant",
        cell: ({ row }) => {
          const draft = drafts[row.original.type];
          if (!draft) return null;
          return (
            <ChipSelect
              style={{ width: 130 }}
              value={draft.variant}
              disabled={!canEdit}
              onChange={(v) => updateDraft(row.original.type, { variant: v as ToastVariant })}
              options={VARIANT_OPTIONS.map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }))}
            />
          );
        },
      },
      {
        header: "Title override",
        id: "title",
        cell: ({ row }) => {
          const draft = drafts[row.original.type];
          if (!draft) return null;
          return (
            <input
              className="input"
              style={{ minWidth: 160 }}
              value={draft.title}
              disabled={!canEdit}
              placeholder={row.original.label}
              onChange={(e) => updateDraft(row.original.type, { title: e.target.value })}
            />
          );
        },
      },
      {
        header: "Message override",
        id: "message",
        cell: ({ row }) => {
          const draft = drafts[row.original.type];
          if (!draft) return null;
          return (
            <input
              className="input"
              style={{ minWidth: 220 }}
              value={draft.message}
              disabled={!canEdit}
              placeholder={row.original.description}
              onChange={(e) => updateDraft(row.original.type, { message: e.target.value })}
            />
          );
        },
      },
      {
        header: "",
        id: "actions",
        cell: ({ row }) => {
          const info = row.original;
          const draft = drafts[info.type];
          if (!draft) return null;
          const dirty = isDirty(info, draft);
          return (
            <div className="row gap-1">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => showToast({ variant: draft.variant, title: draft.title || info.label, message: draft.message || info.description })}
              >
                <Icon name="eye" size={12} /> Preview
              </button>
              <PermissionGate module="admin" action="edit">
                <button
                  className="btn btn-primary btn-sm"
                  disabled={!dirty || saveMutation.isPending}
                  onClick={() => saveMutation.mutate({ type: info.type, draft })}
                >
                  {saveMutation.isPending ? "Saving..." : "Save"}
                </button>
              </PermissionGate>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drafts, data, canEdit, saveMutation.isPending]
  );

  return (
    <div className="card">
      <div style={{ marginBottom: 4 }}>
        <h3 style={{ margin: 0 }}>Toast Designer</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          Customize the pop-up toast shown when each notification type arrives while you're active in the app. Disabling a
          type stops it from popping a toast — it still appears in the notification bell either way.
        </p>
      </div>

      <DataTable
        tableId="admin.toast-settings"
        exportModule="admin"
        columns={columns}
        data={NOTIFICATION_TYPES}
        clientPageSize={20}
        defaultViewMode="list"
        emptyMessage="No notification types configured."
      />
    </div>
  );
}

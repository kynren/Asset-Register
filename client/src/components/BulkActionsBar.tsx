import { ReactNode, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../api/axiosClient";
import { ConfirmDialog } from "./ConfirmDialog";
import { PermissionGate } from "../auth/PermissionGate";
import { ModuleName } from "../lib/permissions";

interface BulkActionsBarProps {
  count: number;
  onClear: () => void;
  children?: ReactNode;
}

// Shared "N selected" toolbar shown above a DataTable once selection is non-empty. `children`
// holds page-specific bulk actions (e.g. Apply Status); BulkDeleteButton below covers the common
// "delete everything selected" case so most pages don't need to hand-roll it.
export function BulkActionsBar({ count, onClear, children }: BulkActionsBarProps) {
  if (count === 0) return null;
  return (
    <div className="alert alert-primary row gap-2" style={{ alignItems: "center", background: "var(--color-primary-soft)" }}>
      <strong>{count} selected</strong>
      {children}
      <button className="btn btn-secondary btn-sm" onClick={onClear}>Clear</button>
    </div>
  );
}

interface BulkDeleteButtonProps {
  selectedIds: number[];
  /** REST base — DELETE is issued to `${baseUrl}/${id}` for each selected id. */
  baseUrl: string;
  entityLabel: string;
  invalidateKeys: string[][];
  onDone: () => void;
  /** RBAC module/action gating the button — defaults match the most common call sites. */
  module?: ModuleName;
  action?: "delete";
}

// Fires one DELETE per selected id (best-effort — Promise.allSettled so one failure doesn't
// block the rest), matching the per-row delete endpoints every module already exposes rather
// than requiring a bespoke bulk-delete route per resource.
export function BulkDeleteButton({ selectedIds, baseUrl, entityLabel, invalidateKeys, onDone, module = "admin", action = "delete" }: BulkDeleteButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const results = await Promise.allSettled(selectedIds.map((id) => axiosClient.delete(`${baseUrl}/${id}`)));
      const failed = results.filter((r) => r.status === "rejected").length;
      return { failed };
    },
    onSuccess: () => {
      invalidateKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      setConfirming(false);
      onDone();
    },
  });

  return (
    <PermissionGate module={module} action={action}>
      <button className="btn btn-danger btn-sm" disabled={selectedIds.length === 0} onClick={() => setConfirming(true)}>
        Delete Selected
      </button>
      {confirming && (
        <ConfirmDialog
          title={`Delete ${selectedIds.length} ${entityLabel}${selectedIds.length === 1 ? "" : "s"}`}
          message={`Delete ${selectedIds.length} selected ${entityLabel}${selectedIds.length === 1 ? "" : "s"}? This cannot be undone.`}
          danger
          loading={mutation.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() => mutation.mutate()}
        />
      )}
    </PermissionGate>
  );
}

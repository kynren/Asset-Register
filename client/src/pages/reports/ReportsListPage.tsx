import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { DataTable } from "../../components/DataTable";
import { Icon } from "../../components/Icon";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useAuth } from "../../auth/AuthContext";
import { getSource } from "../dashboard/dataExplorerConfig";
import { ReportBuilderModal } from "./ReportBuilderModal";
import { ShareReportModal } from "./ShareReportModal";
import { ReportSummary } from "./types";

export function ReportsListPage() {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [sharingReport, setSharingReport] = useState<ReportSummary | null>(null);
  const [deletingReport, setDeletingReport] = useState<ReportSummary | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();

  const { data, isLoading } = useQuery<ReportSummary[]>({
    queryKey: ["reports"],
    queryFn: async () => (await axiosClient.get("/reports")).data,
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`/reports/${id}/duplicate`),
    meta: { successMessage: "Report duplicated" },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reports"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/reports/${id}`),
    meta: { successMessage: "Report deleted" },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      setDeletingReport(null);
    },
  });

  const canEditModule = hasPermission("reports", "edit");
  const canCreateModule = hasPermission("reports", "create");
  const canDeleteModule = hasPermission("reports", "delete");

  const columns: ColumnDef<ReportSummary, any>[] = [
    { header: "Name", accessorKey: "name", meta: { cardTitle: true } },
    { header: "Source", accessorFn: (r) => getSource(r.source)?.label ?? r.source },
    { header: "Owner", accessorFn: (r) => (r.isOwner ? "You" : r.ownerName ?? "—") },
    {
      header: "Shared",
      cell: ({ row }) => (row.original.isOwner ? null : <span className="badge badge-neutral">Shared with you{row.original.canEdit ? " (can edit)" : ""}</span>),
    },
    { header: "Updated", accessorFn: (r) => dayjs(r.updatedAt).format("DD MMM, HH:mm") },
    {
      header: "",
      id: "actions",
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="row gap-1">
            <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/reports/${r.id}`)}>Run</button>
            {r.canEdit && canEditModule && (
              <button className="btn btn-secondary btn-sm btn-icon" title="Edit" onClick={() => setEditingId(r.id)}><Icon name="edit" size={12} /></button>
            )}
            {canCreateModule && (
              <button className="btn btn-secondary btn-sm btn-icon" title="Duplicate" onClick={() => duplicateMutation.mutate(r.id)}><Icon name="paperclip" size={12} /></button>
            )}
            {r.isOwner && canEditModule && (
              <button className="btn btn-secondary btn-sm btn-icon" title="Share" onClick={() => setSharingReport(r)}><Icon name="link" size={12} /></button>
            )}
            {r.isOwner && canDeleteModule && (
              <button className="btn btn-secondary btn-sm btn-icon" title="Delete" onClick={() => setDeletingReport(r)}><Icon name="trash" size={12} /></button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="card">
      <DataTable
        tableId="reports.list"
        columns={columns}
        data={data ?? []}
        isLoading={isLoading}
        clientPageSize={15}
        emptyMessage="No reports yet. Build one with the New Report button above."
      />

      {editingId != null && <ReportBuilderModal reportId={editingId} onClose={() => setEditingId(null)} />}
      {sharingReport && <ShareReportModal reportId={sharingReport.id} reportName={sharingReport.name} onClose={() => setSharingReport(null)} />}
      {deletingReport && (
        <ConfirmDialog
          title="Delete Report"
          message={`Delete "${deletingReport.name}"? This can't be undone.`}
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeletingReport(null)}
          onConfirm={() => deleteMutation.mutate(deletingReport.id)}
        />
      )}
    </div>
  );
}

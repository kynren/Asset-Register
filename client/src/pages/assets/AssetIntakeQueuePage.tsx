import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { ChipSelect } from "../../components/ChipSelect";
import { FormModal } from "../../components/FormModal";
import { PermissionGate } from "../../auth/PermissionGate";

type SubmissionStatus = "PENDING" | "APPROVED" | "REJECTED";

interface Submission {
  id: number;
  categoryId: number;
  category: { id: number; name: string };
  name: string;
  submitterName: string | null;
  submitterEmail: string | null;
  fieldValues: Record<string, string>;
  status: SubmissionStatus;
  reviewNotes: string | null;
  reviewedBy: { id: number; firstName: string; lastName: string } | null;
  resultingAssetId: number | null;
  createdAt: string;
  reviewedAt: string | null;
}

const STATUS_OPTIONS = [
  { value: "PENDING", label: "Pending review" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

// Review queue for AssetCategory.publicIntakeToken submissions — see
// server/src/modules/assets/assetIntakeAdmin.routes.ts. Nothing here ever becomes an Asset until
// a staff member explicitly approves it (see AssetCategoriesTable.tsx for where the public link
// itself is generated).
export function AssetIntakeQueuePage() {
  const [status, setStatus] = useState<SubmissionStatus>("PENDING");
  const [rejecting, setRejecting] = useState<Submission | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: submissions, isLoading } = useQuery({
    queryKey: ["asset-intake-submissions", status],
    queryFn: async () => (await axiosClient.get("/asset-intake-submissions", { params: { status } })).data as Submission[],
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`/asset-intake-submissions/${id}/approve`),
    meta: { successMessage: "Submission approved — asset created" },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["asset-intake-submissions"] }),
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Asset Intake</h1>
          <p className="page-subtitle">Review submissions from public intake links before they become real assets.</p>
        </div>
        <ChipSelect value={status} onChange={(v) => setStatus(v as SubmissionStatus)} options={STATUS_OPTIONS} style={{ width: "auto", minWidth: 180 }} />
      </div>

      {isLoading ? (
        <div className="muted" style={{ padding: "20px 0" }}>Loading submissions...</div>
      ) : !submissions?.length ? (
        <div className="empty-state">No {status.toLowerCase()} submissions.</div>
      ) : (
        <div className="stack gap-2">
          {submissions.map((s) => (
            <div key={s.id} className="card">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {s.category.name} · Submitted {dayjs(s.createdAt).format("DD MMM YYYY HH:mm")}
                    {s.submitterName && ` · ${s.submitterName}`}
                    {s.submitterEmail && ` (${s.submitterEmail})`}
                  </div>
                </div>
                {s.status === "PENDING" ? (
                  <PermissionGate module="assets" action="edit">
                    <div className="row gap-2">
                      <button className="btn btn-danger btn-sm" onClick={() => setRejecting(s)}>
                        <Icon name="close" size={12} /> Reject
                      </button>
                      <button className="btn btn-primary btn-sm" disabled={approveMutation.isPending} onClick={() => approveMutation.mutate(s.id)}>
                        <Icon name="check" size={12} /> Approve
                      </button>
                    </div>
                  </PermissionGate>
                ) : s.status === "APPROVED" && s.resultingAssetId ? (
                  <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/assets/${s.resultingAssetId}`)}>
                    View asset <Icon name="arrowRight" size={12} />
                  </button>
                ) : (
                  <span className="badge badge-danger">Rejected</span>
                )}
              </div>
              {Object.keys(s.fieldValues ?? {}).length > 0 && (
                <div className="stack gap-1" style={{ marginTop: 10, fontSize: 12.5 }}>
                  {Object.entries(s.fieldValues).map(([key, value]) => (
                    <div key={key} className="row gap-2">
                      <span className="muted" style={{ minWidth: 140 }}>{key}</span>
                      <span>{value}</span>
                    </div>
                  ))}
                </div>
              )}
              {s.reviewNotes && (
                <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>Note: {s.reviewNotes}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {rejecting && <RejectModal submission={rejecting} onClose={() => setRejecting(null)} />}
    </div>
  );
}

function RejectModal({ submission, onClose }: { submission: Submission; onClose: () => void }) {
  const [reviewNotes, setReviewNotes] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => axiosClient.post(`/asset-intake-submissions/${submission.id}/reject`, { reviewNotes: reviewNotes || undefined }),
    meta: { successMessage: "Submission rejected" },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["asset-intake-submissions"] }); onClose(); },
  });

  return (
    <FormModal title={`Reject "${submission.name}"`} onClose={onClose} onSubmit={() => mutation.mutate()} submitting={mutation.isPending} submitLabel="Reject Submission">
      <div className="field">
        <label>Notes (optional)</label>
        <textarea className="input" rows={3} placeholder="Why is this being rejected?" value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} />
      </div>
    </FormModal>
  );
}

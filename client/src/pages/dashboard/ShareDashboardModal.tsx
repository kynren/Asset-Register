import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";
import { Icon } from "../../components/Icon";

interface ShareRow {
  id: number;
  canEdit: boolean;
  userName: string | null;
  userEmail: string | null;
  teamName: string | null;
}

export function ShareDashboardModal({ dashboardId, dashboardName, onClose }: { dashboardId: number; dashboardName: string; onClose: () => void }) {
  const [targetType, setTargetType] = useState<"user" | "team">("user");
  const [targetId, setTargetId] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const queryClient = useQueryClient();

  const { data: shares } = useQuery({
    queryKey: ["dashboard-shares", dashboardId],
    queryFn: async () => (await axiosClient.get(`/dashboard/dashboards/${dashboardId}/shares`)).data as ShareRow[],
  });
  const { data: users } = useQuery({ queryKey: ["users-directory"], queryFn: async () => (await axiosClient.get("/users/directory")).data });
  const { data: teams } = useQuery({ queryKey: ["teams"], queryFn: async () => (await axiosClient.get("/teams")).data });

  const shareMutation = useMutation({
    mutationFn: () =>
      axiosClient.post(`/dashboard/dashboards/${dashboardId}/shares`, {
        [targetType === "user" ? "userId" : "teamId"]: Number(targetId),
        canEdit,
      }),
    meta: { successMessage: "Dashboard shared" },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-shares", dashboardId] });
      setTargetId("");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (shareId: number) => axiosClient.delete(`/dashboard/dashboards/${dashboardId}/shares/${shareId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard-shares", dashboardId] }),
  });

  return (
    <FormModal title={`Share "${dashboardName}"`} onClose={onClose} hideFooter maxWidth={480}>
      <div className="field">
        <label>Share With</label>
        <div className="row gap-2" style={{ marginBottom: 8 }}>
          <select className="select" style={{ width: "auto" }} value={targetType} onChange={(e) => { setTargetType(e.target.value as "user" | "team"); setTargetId(""); }}>
            <option value="user">A User</option>
            <option value="team">A Team</option>
          </select>
          <select className="select" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">Select...</option>
            {targetType === "user"
              ? (users ?? []).map((u: any) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)
              : (teams ?? []).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <label className="row gap-1" style={{ fontSize: 13, cursor: "pointer", marginBottom: 8 }}>
          <input type="checkbox" checked={canEdit} onChange={(e) => setCanEdit(e.target.checked)} />
          Allow editing (rearrange, add/remove widgets)
        </label>
        <button className="btn btn-primary btn-sm" disabled={!targetId || shareMutation.isPending} onClick={() => shareMutation.mutate()}>
          Share
        </button>
      </div>

      <div className="field">
        <label>Currently Shared With</label>
        {!shares || shares.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>Not shared with anyone yet.</div>
        ) : (
          <div className="stack gap-1">
            {shares.map((s) => (
              <div key={s.id} className="row" style={{ justifyContent: "space-between", alignItems: "center", padding: "6px 4px", borderBottom: "1px solid var(--color-border)" }}>
                <div>
                  <span style={{ fontSize: 13 }}>{s.userName ?? `Team: ${s.teamName}`}</span>
                  <span className="badge badge-neutral" style={{ marginLeft: 8 }}>{s.canEdit ? "Can edit" : "View only"}</span>
                </div>
                <button className="btn btn-secondary btn-sm btn-icon" onClick={() => removeMutation.mutate(s.id)} title="Remove share">
                  <Icon name="close" size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </FormModal>
  );
}

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { StatusBadge } from "../../components/StatusBadge";
import { PermissionGate } from "../../auth/PermissionGate";

export function TicketApprovalsTab({
  ticketId,
  approvals,
  users,
  teams,
  currentUserId,
}: {
  ticketId: number;
  approvals: any[];
  users: any[];
  teams: any[];
  currentUserId: number;
}) {
  const queryClient = useQueryClient();
  const [targetType, setTargetType] = useState<"user" | "team">("user");
  const [targetId, setTargetId] = useState("");
  const [comment, setComment] = useState("");
  const [refusingId, setRefusingId] = useState<number | null>(null);
  const [refuseComment, setRefuseComment] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["ticket", String(ticketId)] });

  const requestMutation = useMutation({
    mutationFn: () =>
      axiosClient.post(`/tickets/${ticketId}/approvals`, {
        targetUserId: targetType === "user" ? Number(targetId) : undefined,
        targetTeamId: targetType === "team" ? Number(targetId) : undefined,
        comment: comment || undefined,
      }),
    meta: { successMessage: "Approval requested" },
    onSuccess: () => {
      invalidate();
      setTargetId("");
      setComment("");
    },
  });

  const answerMutation = useMutation({
    mutationFn: ({ approvalId, accept, comment: c }: { approvalId: number; accept: boolean; comment?: string }) =>
      axiosClient.post(`/tickets/${ticketId}/approvals/${approvalId}/answer`, { accept, comment: c }),
    meta: { successMessage: "Approval answered" },
    onSuccess: () => {
      invalidate();
      setRefusingId(null);
      setRefuseComment("");
    },
  });

  function isTargetOfApproval(a: any) {
    if (a.targetUserId === currentUserId) return true;
    if (a.targetTeamId) {
      const team = teams?.find((t: any) => t.id === a.targetTeamId);
      return Boolean(team?.members?.some((m: any) => m.user.id === currentUserId));
    }
    return false;
  }

  return (
    <div className="card">
      <h3 className="mt-0">Approvals</h3>
      <div className="stack gap-2" style={{ marginBottom: 16 }}>
        {(!approvals || approvals.length === 0) && <div className="muted">No approvals have been requested.</div>}
        {approvals?.map((a: any) => (
          <div key={a.id} style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: 10 }}>
            <div className="row gap-2" style={{ alignItems: "center", fontSize: 12 }}>
              <StatusBadge status={a.status} />
              <span className="muted">
                Requested by {a.requestedBy.firstName} {a.requestedBy.lastName} on {dayjs(a.createdAt).format("DD MMM YYYY")}
              </span>
            </div>
            <p style={{ margin: "4px 0 0" }}>
              Target: <strong>{a.targetUser ? `${a.targetUser.firstName} ${a.targetUser.lastName}` : a.targetTeam?.name}</strong>
            </p>
            {a.comment && <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>"{a.comment}"</p>}
            {a.answeredBy && (
              <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>
                {a.status === "ACCEPTED" ? "Approved" : "Refused"} by {a.answeredBy.firstName} {a.answeredBy.lastName} on {dayjs(a.answeredAt).format("DD MMM YYYY")}
                {a.answerComment && ` — "${a.answerComment}"`}
              </p>
            )}
            {a.status === "WAITING" && isTargetOfApproval(a) && (
              <div className="stack gap-2" style={{ marginTop: 8 }}>
                {refusingId === a.id ? (
                  <div className="stack gap-2">
                    <input className="input" placeholder="Explain why you're refusing..." value={refuseComment} onChange={(e) => setRefuseComment(e.target.value)} />
                    <div className="row gap-2">
                      <button
                        className="btn btn-danger btn-sm"
                        disabled={!refuseComment.trim() || answerMutation.isPending}
                        onClick={() => answerMutation.mutate({ approvalId: a.id, accept: false, comment: refuseComment })}
                      >
                        Confirm Refuse
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => setRefusingId(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="row gap-2">
                    <button className="btn btn-primary btn-sm" disabled={answerMutation.isPending} onClick={() => answerMutation.mutate({ approvalId: a.id, accept: true })}>
                      Approve
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setRefusingId(a.id)}>Refuse</button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <PermissionGate module="helpdesk" action="edit">
        <div className="stack gap-2">
          <div className="row gap-2 flex-wrap">
            <select className="input" style={{ maxWidth: 140 }} value={targetType} onChange={(e) => { setTargetType(e.target.value as any); setTargetId(""); }}>
              <option value="user">User</option>
              <option value="team">Team</option>
            </select>
            <select className="input" style={{ maxWidth: 220 }} value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">{targetType === "user" ? "Select a user..." : "Select a team..."}</option>
              {(targetType === "user" ? users : teams)?.map((item: any) => (
                <option key={item.id} value={item.id}>{targetType === "user" ? `${item.firstName} ${item.lastName}` : item.name}</option>
              ))}
            </select>
            <input className="input" placeholder="Optional comment" value={comment} onChange={(e) => setComment(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
            <button className="btn btn-primary btn-sm" disabled={!targetId || requestMutation.isPending} onClick={() => requestMutation.mutate()}>
              Request Approval
            </button>
          </div>
        </div>
      </PermissionGate>
    </div>
  );
}

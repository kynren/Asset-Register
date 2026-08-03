import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { StatusBadge } from "../../components/StatusBadge";
import { PermissionGate } from "../../auth/PermissionGate";

export function TicketSolutionTab({ ticketId, solutions, isRequester }: { ticketId: number; solutions: any[]; isRequester: boolean }) {
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [refusingId, setRefusingId] = useState<number | null>(null);
  const [refuseComment, setRefuseComment] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["ticket", String(ticketId)] });

  const proposeMutation = useMutation({
    mutationFn: () => axiosClient.post(`/tickets/${ticketId}/solutions`, { content }),
    meta: { successMessage: "Solution proposed" },
    onSuccess: () => {
      invalidate();
      setContent("");
    },
  });

  const answerMutation = useMutation({
    mutationFn: ({ solutionId, accept, comment }: { solutionId: number; accept: boolean; comment?: string }) =>
      axiosClient.post(`/tickets/${ticketId}/solutions/${solutionId}/answer`, { accept, comment }),
    meta: { successMessage: "Solution answered" },
    onSuccess: () => {
      invalidate();
      setRefusingId(null);
      setRefuseComment("");
    },
  });

  return (
    <div className="card">
      <h3 className="mt-0">Solutions</h3>
      <div className="stack gap-2" style={{ marginBottom: 16 }}>
        {(!solutions || solutions.length === 0) && <div className="muted">No solution has been proposed yet.</div>}
        {solutions?.map((s: any) => (
          <div key={s.id} style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: 10 }}>
            <div className="row gap-2" style={{ alignItems: "center", fontSize: 12 }}>
              <StatusBadge status={s.status} />
              <strong>{s.author.firstName} {s.author.lastName}</strong>
              <span className="muted">{dayjs(s.createdAt).format("DD MMM YYYY, HH:mm")}</span>
            </div>
            <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{s.content}</p>
            {s.answeredBy && (
              <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>
                {s.status === "ACCEPTED" ? "Accepted" : "Refused"} by {s.answeredBy.firstName} {s.answeredBy.lastName} on {dayjs(s.answeredAt).format("DD MMM YYYY")}
                {s.answerComment && ` — "${s.answerComment}"`}
              </p>
            )}
            {isRequester && s.status === "WAITING" && (
              <div className="stack gap-2" style={{ marginTop: 8 }}>
                {refusingId === s.id ? (
                  <div className="stack gap-2">
                    <input className="input" placeholder="Explain why you're refusing this solution..." value={refuseComment} onChange={(e) => setRefuseComment(e.target.value)} />
                    <div className="row gap-2">
                      <button
                        className="btn btn-danger btn-sm"
                        disabled={!refuseComment.trim() || answerMutation.isPending}
                        onClick={() => answerMutation.mutate({ solutionId: s.id, accept: false, comment: refuseComment })}
                      >
                        Confirm Refuse
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => setRefusingId(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="row gap-2">
                    <button className="btn btn-primary btn-sm" disabled={answerMutation.isPending} onClick={() => answerMutation.mutate({ solutionId: s.id, accept: true })}>
                      Accept Solution
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setRefusingId(s.id)}>Refuse</button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <PermissionGate module="helpdesk" action="edit">
        <div className="stack gap-2">
          <textarea className="input" rows={3} placeholder="Propose a solution..." value={content} onChange={(e) => setContent(e.target.value)} />
          <button className="btn btn-primary btn-sm" style={{ width: "fit-content" }} disabled={!content.trim() || proposeMutation.isPending} onClick={() => proposeMutation.mutate()}>
            Propose Solution
          </button>
        </div>
      </PermissionGate>
    </div>
  );
}

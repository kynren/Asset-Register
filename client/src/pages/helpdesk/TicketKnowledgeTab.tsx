import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { PermissionGate, usePermission } from "../../auth/PermissionGate";

export function TicketKnowledgeTab({ ticketId, knowledgeArticles }: { ticketId: number; knowledgeArticles: any[] }) {
  const queryClient = useQueryClient();
  const canSearchKb = usePermission("operations", "view");
  const [search, setSearch] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["ticket", String(ticketId)] });

  const { data: searchResults } = useQuery({
    queryKey: ["kb-search", search],
    queryFn: async () => (await axiosClient.get("/operations/knowledge", { params: { search: search || undefined } })).data,
    enabled: canSearchKb,
  });

  const attachMutation = useMutation({
    mutationFn: (articleId: number) => axiosClient.post(`/tickets/${ticketId}/knowledge-articles`, { articleId }),
    meta: { successMessage: "Article attached" },
    onSuccess: invalidate,
  });

  const detachMutation = useMutation({
    mutationFn: (linkId: number) => axiosClient.delete(`/tickets/${ticketId}/knowledge-articles/${linkId}`),
    meta: { successMessage: "Article detached" },
    onSuccess: invalidate,
  });

  const attachedIds = new Set((knowledgeArticles ?? []).map((k: any) => k.article.id));

  return (
    <div className="card">
      <h3 className="mt-0">Knowledge Base</h3>
      <div className="stack gap-2" style={{ marginBottom: 16 }}>
        {(!knowledgeArticles || knowledgeArticles.length === 0) && <div className="muted">No knowledge base articles attached.</div>}
        {knowledgeArticles?.map((k: any) => (
          <div key={k.id} className="row gap-2" style={{ justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--color-border)" }}>
            <span className="row gap-1" style={{ fontSize: 13 }}>
              <Icon name="book" size={13} /> {k.article.title}
            </span>
            <PermissionGate module="helpdesk" action="edit">
              <button className="btn btn-danger btn-sm btn-icon" onClick={() => detachMutation.mutate(k.id)}>
                <Icon name="trash" size={12} />
              </button>
            </PermissionGate>
          </div>
        ))}
      </div>

      <PermissionGate module="helpdesk" action="edit">
        {canSearchKb ? (
          <div className="stack gap-2">
            <input className="input" placeholder="Search knowledge base articles..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="stack gap-1" style={{ maxHeight: 220, overflowY: "auto" }}>
              {searchResults?.filter((a: any) => !attachedIds.has(a.id)).map((a: any) => (
                <div key={a.id} className="row gap-2" style={{ justifyContent: "space-between", alignItems: "center", padding: "4px 6px", border: "1px solid var(--color-border)", borderRadius: 8 }}>
                  <div>
                    <div style={{ fontSize: 13 }}>{a.title}</div>
                    {a.category && <div className="muted" style={{ fontSize: 11 }}>{a.category}</div>}
                  </div>
                  <button className="btn btn-secondary btn-sm" disabled={attachMutation.isPending} onClick={() => attachMutation.mutate(a.id)}>Attach</button>
                </div>
              ))}
              {searchResults && searchResults.filter((a: any) => !attachedIds.has(a.id)).length === 0 && (
                <div className="muted" style={{ fontSize: 12 }}>No matching articles.</div>
              )}
            </div>
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 12 }}>You don't have access to search the knowledge base.</div>
        )}
      </PermissionGate>
    </div>
  );
}

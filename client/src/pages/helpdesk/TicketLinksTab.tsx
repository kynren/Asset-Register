import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { axiosClient } from "../../api/axiosClient";
import { StatusBadge } from "../../components/StatusBadge";
import { Icon } from "../../components/Icon";
import { PermissionGate } from "../../auth/PermissionGate";

const LINK_TYPE_LABELS: Record<string, string> = {
  RELATES_TO: "Relates to",
  CAUSES: "Causes",
  CAUSED_BY: "Caused by",
  DUPLICATES: "Duplicates",
};

export function TicketLinksTab({ ticketId, linksFrom, linksTo }: { ticketId: number; linksFrom: any[]; linksTo: any[] }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [linkType, setLinkType] = useState("RELATES_TO");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["ticket", String(ticketId)] });

  const { data: searchResults } = useQuery({
    queryKey: ["ticket-link-search", search],
    queryFn: async () => (await axiosClient.get("/tickets", { params: { search, pageSize: 8 } })).data.items,
    enabled: search.trim().length > 1,
  });

  const linkMutation = useMutation({
    mutationFn: (linkedTicketId: number) => axiosClient.post(`/tickets/${ticketId}/links`, { linkedTicketId, linkType }),
    meta: { successMessage: "Ticket linked" },
    onSuccess: () => {
      invalidate();
      setSearch("");
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (linkId: number) => axiosClient.delete(`/tickets/${ticketId}/links/${linkId}`),
    meta: { successMessage: "Link removed" },
    onSuccess: invalidate,
  });

  const combined = [
    ...(linksFrom ?? []).map((l: any) => ({ id: l.id, type: l.linkType, ticket: l.linkedTicket, deletable: true })),
    ...(linksTo ?? []).map((l: any) => ({ id: l.id, type: l.linkType, ticket: l.ticket, deletable: false, reverse: true })),
  ];

  return (
    <div className="card">
      <h3 className="mt-0">Linked Tickets</h3>
      <div className="stack gap-2" style={{ marginBottom: 16 }}>
        {combined.length === 0 && <div className="muted">No linked tickets.</div>}
        {combined.map((l) => (
          <div key={`${l.reverse ? "to" : "from"}-${l.id}`} className="row gap-2" style={{ justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--color-border)" }}>
            <div className="row gap-2" style={{ alignItems: "center" }}>
              <span className="muted" style={{ fontSize: 12 }}>{l.reverse ? `${LINK_TYPE_LABELS[l.type] ?? l.type} this` : LINK_TYPE_LABELS[l.type] ?? l.type}</span>
              <a style={{ cursor: "pointer", color: "var(--color-primary)" }} onClick={() => navigate(`/helpdesk/${l.ticket.id}`)}>
                {l.ticket.ticketNumber} — {l.ticket.title}
              </a>
              <StatusBadge status={l.ticket.status} />
            </div>
            {l.deletable && (
              <PermissionGate module="helpdesk" action="edit">
                <button className="btn btn-danger btn-sm btn-icon" onClick={() => unlinkMutation.mutate(l.id)}>
                  <Icon name="trash" size={12} />
                </button>
              </PermissionGate>
            )}
          </div>
        ))}
      </div>

      <PermissionGate module="helpdesk" action="edit">
        <div className="stack gap-2">
          <div className="row gap-2 flex-wrap">
            <select className="input" style={{ maxWidth: 160 }} value={linkType} onChange={(e) => setLinkType(e.target.value)}>
              {Object.entries(LINK_TYPE_LABELS).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
            <input className="input" placeholder="Search tickets by number or title..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
          </div>
          {search.trim().length > 1 && (
            <div className="stack gap-1" style={{ maxHeight: 180, overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: 8, padding: 6 }}>
              {searchResults?.filter((t: any) => t.id !== ticketId).length ? (
                searchResults.filter((t: any) => t.id !== ticketId).map((t: any) => (
                  <div key={t.id} className="row gap-2" style={{ justifyContent: "space-between", alignItems: "center", padding: "4px 6px" }}>
                    <span style={{ fontSize: 13 }}>{t.ticketNumber} — {t.title}</span>
                    <button className="btn btn-secondary btn-sm" disabled={linkMutation.isPending} onClick={() => linkMutation.mutate(t.id)}>Link</button>
                  </div>
                ))
              ) : (
                <div className="muted" style={{ fontSize: 12, padding: 4 }}>No matching tickets.</div>
              )}
            </div>
          )}
        </div>
      </PermissionGate>
    </div>
  );
}

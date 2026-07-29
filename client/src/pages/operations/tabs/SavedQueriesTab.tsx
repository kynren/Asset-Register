import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { axiosClient } from "../../../api/axiosClient";
import { Icon } from "../../../components/Icon";

interface SavedQuery {
  id: number;
  label: string;
  module: string;
  queryString: string;
  createdAt: string;
}

const MODULES = [
  { value: "assets", label: "Asset Inventory", path: "/assets" },
  { value: "tickets", label: "Helpdesk & Ticketing", path: "/helpdesk" },
  { value: "stock", label: "Stock Register", path: "/stock" },
  { value: "devices", label: "Network Devices", path: "/network" },
];

export function SavedQueriesTab() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [label, setLabel] = useState("");
  const [module, setModule] = useState("assets");
  const [queryString, setQueryString] = useState("");

  const { data: queries, isLoading } = useQuery({
    queryKey: ["op-saved-queries"],
    queryFn: async () => (await axiosClient.get("/operations/saved-queries")).data as SavedQuery[],
  });

  const createMutation = useMutation({
    mutationFn: () => axiosClient.post("/operations/saved-queries", { label, module, queryString }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["op-saved-queries"] });
      setLabel("");
      setQueryString("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/operations/saved-queries/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["op-saved-queries"] }),
  });

  function apply(q: SavedQuery) {
    const target = MODULES.find((m) => m.value === q.module);
    if (target) navigate(`${target.path}?${q.queryString}`);
  }

  return (
    <div>
      <div className="ad-panel" style={{ marginBottom: 18 }}>
        <div className="ad-panel-title">Save a Query</div>
        <p style={{ fontSize: 12, color: "var(--ad-text-muted)", marginTop: -6, marginBottom: 12 }}>
          Bookmark a filter/search combination (e.g. <code>search=repair</code>, <code>status=IN_REPAIR</code>) to re-apply later.
        </p>
        <div className="ad-add-form">
          <div className="ad-field"><label>Label</label><input className="ad-input" placeholder="e.g. Overdue Repairs" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
          <div className="ad-field">
            <label>Module</label>
            <select className="ad-select" value={module} onChange={(e) => setModule(e.target.value)}>
              {MODULES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div className="ad-field"><label>Query String</label><input className="ad-input" placeholder="e.g. status=IN_REPAIR&search=laptop" value={queryString} onChange={(e) => setQueryString(e.target.value)} /></div>
          <button className="ad-btn ad-btn-primary" disabled={!label || !queryString || createMutation.isPending} onClick={() => createMutation.mutate()}>
            <Icon name="bookmark" size={12} /> Save Query
          </button>
        </div>
      </div>

      <div className="ad-panel">
        <div className="ad-panel-title">Saved Queries</div>
        {isLoading ? (
          <div className="ad-empty">Loading...</div>
        ) : queries && queries.length > 0 ? (
          <div className="stack gap-2">
            {queries.map((q) => (
              <div key={q.id} className="ad-row-card">
                <div>
                  <div className="ad-row-value">{q.label}</div>
                  <div className="ad-row-label" style={{ textTransform: "none" }}>
                    {MODULES.find((m) => m.value === q.module)?.label ?? q.module} · {q.queryString} · Saved {dayjs(q.createdAt).format("DD MMM YYYY")}
                  </div>
                </div>
                <div className="row gap-1">
                  <button className="ad-btn ad-btn-primary" onClick={() => apply(q)}><Icon name="chevronRight" size={12} /> Apply</button>
                  <button className="ad-btn ad-btn-danger" onClick={() => deleteMutation.mutate(q.id)}><Icon name="trash" size={12} /></button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="ad-empty">No saved queries yet. Save one above to quickly re-apply filters later.</div>
        )}
      </div>
    </div>
  );
}

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../../api/axiosClient";
import { Icon } from "../../../components/Icon";
import { PermissionGate } from "../../../auth/PermissionGate";

interface Schedule {
  id: number;
  resourceName: string;
  scheduledBy: { id: number; firstName: string; lastName: string };
  startAt: string;
  endAt: string;
  notes: string | null;
  createdAt: string;
}

export function ResourceSchedulingTab() {
  const queryClient = useQueryClient();
  const [resourceName, setResourceName] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: schedules, isLoading } = useQuery({
    queryKey: ["op-scheduling"],
    queryFn: async () => (await axiosClient.get("/operations/scheduling")).data as Schedule[],
  });

  const createMutation = useMutation({
    mutationFn: () =>
      axiosClient.post("/operations/scheduling", {
        resourceName,
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
        notes: notes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["op-scheduling"] });
      setResourceName("");
      setStartAt("");
      setEndAt("");
      setNotes("");
      setError(null);
    },
    onError: (err: any) => setError(err?.response?.data?.error ?? "Could not create schedule."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/operations/scheduling/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["op-scheduling"] }),
  });

  const upcoming = schedules?.filter((s) => new Date(s.endAt) >= new Date()) ?? [];

  return (
    <div>
      <div className="ad-panel" style={{ marginBottom: 18 }}>
        <div className="ad-panel-title">Schedule a Resource</div>
        <p style={{ fontSize: 12, color: "var(--ad-text-muted)", marginTop: -6, marginBottom: 12 }}>
          Reserve a named resource (a room, crew, or piece of equipment not tracked as a formal Asset).
        </p>
        {error && <div className="ad-badge ad-badge-danger" style={{ marginBottom: 12, display: "block", width: "fit-content" }}>{error}</div>}
        <div className="ad-add-form">
          <div className="ad-field"><label>Resource Name</label><input className="ad-input" placeholder="e.g. Meeting Room A" value={resourceName} onChange={(e) => setResourceName(e.target.value)} /></div>
          <div className="ad-field"><label>Start</label><input className="ad-input" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} /></div>
          <div className="ad-field"><label>End</label><input className="ad-input" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} /></div>
          <div className="ad-field"><label>Notes</label><input className="ad-input" placeholder="Optional" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <button
            className="ad-btn ad-btn-primary"
            disabled={!resourceName || !startAt || !endAt || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            <Icon name="clock" size={12} /> Schedule
          </button>
        </div>
      </div>

      <div className="ad-panel">
        <div className="ad-panel-title">Upcoming Schedule</div>
        {isLoading ? (
          <div className="ad-empty">Loading...</div>
        ) : upcoming.length > 0 ? (
          <div className="stack gap-2">
            {upcoming.map((s) => (
              <div key={s.id} className="ad-row-card">
                <div>
                  <div className="ad-row-value">{s.resourceName}</div>
                  <div className="ad-row-label" style={{ textTransform: "none" }}>
                    {dayjs(s.startAt).format("DD MMM YYYY, HH:mm")} → {dayjs(s.endAt).format("DD MMM YYYY, HH:mm")} · {s.scheduledBy.firstName} {s.scheduledBy.lastName}
                    {s.notes ? ` · ${s.notes}` : ""}
                  </div>
                </div>
                <PermissionGate module="operations" action="delete">
                  <button className="ad-btn ad-btn-danger" onClick={() => deleteMutation.mutate(s.id)}><Icon name="trash" size={12} /></button>
                </PermissionGate>
              </div>
            ))}
          </div>
        ) : (
          <div className="ad-empty">No upcoming resource schedules.</div>
        )}
      </div>
    </div>
  );
}

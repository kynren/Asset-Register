import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { PermissionGate } from "../../auth/PermissionGate";

interface Settings {
  surveySampleRatePercent: number;
  surveyDelayDays: number;
  surveyExpireDays: number;
  autoCloseDelayDays: number;
}

export function HelpdeskSettingsTab() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["helpdesk-settings"], queryFn: async () => (await axiosClient.get("/helpdesk-settings")).data as Settings });
  const [form, setForm] = useState<Settings>({ surveySampleRatePercent: 100, surveyDelayDays: 1, surveyExpireDays: 30, autoCloseDelayDays: 4 });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => axiosClient.put("/helpdesk-settings", form),
    meta: { successMessage: "Helpdesk settings saved" },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["helpdesk-settings"] }),
  });

  if (isLoading) return <div className="card">Loading...</div>;

  return (
    <div className="card">
      <h3 className="mt-0">Helpdesk Settings</h3>
      <div className="stack gap-3" style={{ maxWidth: 480 }}>
        <div className="field">
          <label>Satisfaction survey sample rate (%)</label>
          <input className="input" type="number" min={0} max={100} value={form.surveySampleRatePercent} onChange={(e) => setForm((f) => ({ ...f, surveySampleRatePercent: Number(e.target.value) }))} />
          <span className="muted" style={{ fontSize: 12 }}>Percentage of closed tickets that get asked for a rating.</span>
        </div>
        <div className="field">
          <label>Survey delay (days after close)</label>
          <input className="input" type="number" min={0} value={form.surveyDelayDays} onChange={(e) => setForm((f) => ({ ...f, surveyDelayDays: Number(e.target.value) }))} />
        </div>
        <div className="field">
          <label>Survey expiry (days after close)</label>
          <input className="input" type="number" min={1} value={form.surveyExpireDays} onChange={(e) => setForm((f) => ({ ...f, surveyExpireDays: Number(e.target.value) }))} />
          <span className="muted" style={{ fontSize: 12 }}>Tickets closed longer ago than this are never surveyed.</span>
        </div>
        <div className="field">
          <label>Auto-close delay (days after a solution is proposed)</label>
          <input className="input" type="number" min={0} value={form.autoCloseDelayDays} onChange={(e) => setForm((f) => ({ ...f, autoCloseDelayDays: Number(e.target.value) }))} />
          <span className="muted" style={{ fontSize: 12 }}>Set to 0 to accept and close solutions immediately instead of waiting for requester confirmation.</span>
        </div>
        <PermissionGate module="admin" action="edit">
          <button className="btn btn-primary btn-sm" style={{ width: "fit-content" }} disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            Save Settings
          </button>
        </PermissionGate>
      </div>
    </div>
  );
}

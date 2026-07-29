import { useMutation, useQuery } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";

interface PtzResult {
  ok: boolean;
  command?: string;
  message: string;
}

interface PtzPreset {
  token: string;
  name: string;
}

export function PtzControlModal({ cameraId, cameraName, onClose }: { cameraId: number; cameraName: string; onClose: () => void }) {
  const mutation = useMutation({
    mutationFn: async (command: string) => (await axiosClient.post<PtzResult>(`/nvr/cameras/${cameraId}/ptz`, { command })).data,
  });

  const gotoPresetMutation = useMutation({
    mutationFn: async (presetToken: string) => (await axiosClient.post<PtzResult>(`/nvr/cameras/${cameraId}/ptz/goto-preset`, { presetToken })).data,
  });

  const { data: presetsResult, error: presetsError, isLoading: presetsLoading } = useQuery({
    queryKey: ["ptz-presets", cameraId],
    queryFn: async () => (await axiosClient.get(`/nvr/cameras/${cameraId}/ptz/presets`)).data as { ok: boolean; presets: PtzPreset[]; message: string },
    retry: false,
  });

  const lastError = gotoPresetMutation.error ?? mutation.error;
  const lastResult = lastError
    ? { ok: false, message: (lastError as any)?.response?.data?.error ?? "Request failed." }
    : gotoPresetMutation.data ?? mutation.data;
  const presetsErrorMessage = presetsError ? (presetsError as any)?.response?.data?.error ?? "Could not load presets." : null;

  return (
    <FormModal title={`PTZ Control — ${cameraName}`} onClose={onClose} hideFooter>
      <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>
        Sends a real ONVIF PTZ command directly to the camera over the network. Requires the camera to be a reachable,
        ONVIF-compliant PTZ device — connection or protocol failures are reported honestly below.
      </p>
      <div className="grid grid-cols-3" style={{ maxWidth: 260, margin: "16px auto", gap: 8 }}>
        <div />
        <button className="btn btn-secondary btn-icon" onClick={() => mutation.mutate("UP")}><Icon name="arrowUp" size={16} /></button>
        <div />
        <button className="btn btn-secondary btn-icon" onClick={() => mutation.mutate("LEFT")}><Icon name="arrowLeft" size={16} /></button>
        <button className="btn btn-secondary btn-icon" onClick={() => mutation.mutate("HOME")}><Icon name="home" size={16} /></button>
        <button className="btn btn-secondary btn-icon" onClick={() => mutation.mutate("RIGHT")}><Icon name="arrowRight" size={16} /></button>
        <div />
        <button className="btn btn-secondary btn-icon" onClick={() => mutation.mutate("DOWN")}><Icon name="arrowDown" size={16} /></button>
        <div />
      </div>
      <div className="row gap-2" style={{ justifyContent: "center" }}>
        <button className="btn btn-secondary btn-sm" onClick={() => mutation.mutate("ZOOM_IN")}><Icon name="zoomIn" size={13} /> Zoom In</button>
        <button className="btn btn-secondary btn-sm" onClick={() => mutation.mutate("ZOOM_OUT")}><Icon name="zoomOut" size={13} /> Zoom Out</button>
      </div>

      {lastResult && (
        <div className={`alert ${lastResult.ok ? "alert-success" : "alert-danger"}`} style={{ marginTop: 14 }}>
          {lastResult.message}
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <h4 style={{ margin: "0 0 8px" }}>Saved Presets</h4>
        {presetsLoading ? (
          <div className="row gap-2"><Skeleton width={70} height={28} /><Skeleton width={70} height={28} /><Skeleton width={70} height={28} /></div>
        ) : presetsResult?.presets.length ? (
          <div className="row gap-2 flex-wrap">
            {presetsResult.presets.map((p) => (
              <button key={p.token} className="btn btn-secondary btn-sm" disabled={gotoPresetMutation.isPending} onClick={() => gotoPresetMutation.mutate(p.token)}>
                {p.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="muted" style={{ fontSize: 12 }}>{presetsErrorMessage ?? presetsResult?.message ?? "No presets found."}</p>
        )}
      </div>

      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
      </div>
    </FormModal>
  );
}

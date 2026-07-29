import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";

interface PtzResult {
  ok: boolean;
  command?: string;
  message: string;
}
interface PtzPreset {
  token: string;
  name: string;
}

// Embedded, compact version of PtzControlModal's real ONVIF PTZ control, bound to whichever
// camera is currently focused in the video matrix. Sends genuine ContinuousMove/GotoHome
// commands — no fabricated "focus" control is included since the backend has no ONVIF
// Imaging-service support to back one (PTZ vs Imaging are different ONVIF services).
export function PtzAlignmentPanel({
  camera,
}: {
  camera: { id: number; name: string; ipAddress: string | null; ptzEnabled: boolean } | null;
}) {
  const [speed, setSpeed] = useState(5);
  const cameraId = camera?.id;

  const mutation = useMutation({
    mutationFn: async (command: string) => (await axiosClient.post<PtzResult>(`/nvr/cameras/${cameraId}/ptz`, { command, speed })).data,
  });
  const gotoPresetMutation = useMutation({
    mutationFn: async (presetToken: string) => (await axiosClient.post<PtzResult>(`/nvr/cameras/${cameraId}/ptz/goto-preset`, { presetToken })).data,
  });

  const { data: presetsResult } = useQuery({
    queryKey: ["ptz-presets-panel", cameraId],
    queryFn: async () => (await axiosClient.get(`/nvr/cameras/${cameraId}/ptz/presets`)).data as { ok: boolean; presets: PtzPreset[]; message: string },
    enabled: Boolean(cameraId && camera?.ptzEnabled),
    retry: false,
  });

  const lastError = gotoPresetMutation.error ?? mutation.error;
  const lastResult = lastError
    ? { ok: false, message: (lastError as any)?.response?.data?.error ?? "Request failed." }
    : gotoPresetMutation.data ?? mutation.data;

  const disabled = !camera || !camera.ptzEnabled || mutation.isPending || gotoPresetMutation.isPending;

  return (
    <div className="nvx-ptz-panel">
      <div className="nvx-panel-title"><Icon name="route" size={13} /> PTZ Alignment Panel</div>

      {camera ? (
        <>
          <div className="nvx-ptz-info">
            <div className="nvx-ptz-info-row"><span>Linked Cam:</span><span>{camera.name}</span></div>
            <div className="nvx-ptz-info-row"><span>IP Address:</span><span>{camera.ipAddress ?? "—"}</span></div>
            <div className="nvx-ptz-info-row"><span>PTZ Support:</span><span>{camera.ptzEnabled ? "Enabled" : "Not enabled"}</span></div>
          </div>

          {!camera.ptzEnabled && (
            <p className="muted" style={{ fontSize: 11, marginTop: -6, marginBottom: 12 }}>
              This camera doesn't have PTZ enabled — controls are disabled.
            </p>
          )}

          <div className="nvx-joystick">
            <button className="nvx-joystick-btn nvx-joystick-up" disabled={disabled} onClick={() => mutation.mutate("UP")}>
              <Icon name="arrowUp" size={14} />
            </button>
            <button className="nvx-joystick-btn nvx-joystick-left" disabled={disabled} onClick={() => mutation.mutate("LEFT")}>
              <Icon name="arrowLeft" size={14} />
            </button>
            <button className="nvx-joystick-home" disabled={disabled} onClick={() => mutation.mutate("HOME")} title="Home position">
              HOME
            </button>
            <button className="nvx-joystick-btn nvx-joystick-right" disabled={disabled} onClick={() => mutation.mutate("RIGHT")}>
              <Icon name="arrowRight" size={14} />
            </button>
            <button className="nvx-joystick-btn nvx-joystick-down" disabled={disabled} onClick={() => mutation.mutate("DOWN")}>
              <Icon name="arrowDown" size={14} />
            </button>
          </div>

          <div className="nvx-ptz-subgrid">
            <div>
              <div className="nvx-ptz-sublabel">Lens Zoom</div>
              <div className="nvx-ptz-subrow">
                <button className="nvx-ptz-subbtn" disabled={disabled} onClick={() => mutation.mutate("ZOOM_IN")}>
                  <Icon name="zoomIn" size={11} /> Zoom+
                </button>
                <button className="nvx-ptz-subbtn" disabled={disabled} onClick={() => mutation.mutate("ZOOM_OUT")}>
                  <Icon name="zoomOut" size={11} /> Zoom-
                </button>
              </div>
            </div>
          </div>

          <div className="nvx-ptz-speed-row">
            <span>PTZ Drive Speed</span>
            <span>{speed} / 10</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            style={{ width: "100%", accentColor: "var(--color-primary)" }}
          />

          {presetsResult && presetsResult.presets.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="nvx-ptz-sublabel">Saved Presets</div>
              <div className="row gap-1 flex-wrap">
                {presetsResult.presets.map((p) => (
                  <button
                    key={p.token}
                    className="nvx-ptz-subbtn"
                    style={{ flex: "0 0 auto" }}
                    disabled={disabled}
                    onClick={() => gotoPresetMutation.mutate(p.token)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {lastResult && (
            <div className={`alert ${lastResult.ok ? "alert-success" : "alert-danger"}`} style={{ marginTop: 12, fontSize: 11, padding: "6px 10px" }}>
              {lastResult.message}
            </div>
          )}
        </>
      ) : (
        <div className="nvx-ptz-empty">
          Select a camera tile in the matrix to align its PTZ controls here.
        </div>
      )}
    </div>
  );
}

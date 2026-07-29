import { useMutation } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";
import { Icon } from "../../components/Icon";

export function PtzControlModal({ cameraId, cameraName, onClose }: { cameraId: number; cameraName: string; onClose: () => void }) {
  const mutation = useMutation({
    mutationFn: (command: string) => axiosClient.post(`/nvr/cameras/${cameraId}/ptz`, { command }),
  });

  return (
    <FormModal title={`PTZ Control — ${cameraName}`} onClose={onClose} hideFooter>
      <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>
        Sends a PTZ command to the camera and logs it to the event log. Actual pan/tilt/zoom motion requires the camera's
        ONVIF/vendor SDK to be wired up to this endpoint on your NVR hardware.
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
      {mutation.isSuccess && <div className="alert alert-success" style={{ marginTop: 14 }}>Command sent.</div>}
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
      </div>
    </FormModal>
  );
}

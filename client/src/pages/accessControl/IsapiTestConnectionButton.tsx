import { useMutation } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";

interface IsapiTestResult {
  ok: boolean;
  info: { deviceName: string; model: string; serialNumber: string; firmwareVersion: string; deviceType: string } | null;
  message: string;
}

// Access control panels only ever speak ISAPI here (no ONVIF/RTSP alternative like the camera
// side has), so unlike the NVR module's TestConnectionButton this never branches on protocol.
export function IsapiTestConnectionButton({
  ipAddress,
  port,
  username,
  password,
  deviceId,
}: {
  ipAddress: string;
  port: number | null;
  username?: string;
  password?: string;
  // Edit-form case: the password field is deliberately left blank ("leave blank to keep current
  // password") rather than re-populated with the saved secret. Passing deviceId lets the backend
  // fall back to the already-stored password when password is blank, instead of testing with an
  // empty one and reporting a misleading "authentication failed".
  deviceId?: number;
}) {
  const mutation = useMutation({
    mutationFn: () =>
      axiosClient.post<IsapiTestResult>("/access-control/isapi/test-connection", {
        ipAddress,
        port,
        username: username || undefined,
        password: password || undefined,
        deviceId,
      }),
  });

  const data = mutation.data?.data;
  const failMessage = (mutation.error as any)?.response?.data?.error as string | undefined;

  return (
    <div className="field">
      <label>Connection Test (ISAPI)</label>
      <button className="btn btn-secondary" type="button" disabled={!ipAddress || mutation.isPending} onClick={() => mutation.mutate()}>
        <Icon name="wifi" size={13} /> {mutation.isPending ? "Testing..." : "Test Connection"}
      </button>
      {data && (
        <div className={`alert ${data.ok ? "alert-success" : "alert-danger"}`} style={{ marginTop: 8, marginBottom: 0 }}>
          {data.message}
          {data.info && (data.info.deviceName || data.info.model) && ` — ${data.info.deviceName || data.info.model}${data.info.firmwareVersion ? ` (fw ${data.info.firmwareVersion})` : ""}`}
        </div>
      )}
      {mutation.isError && !data && (
        <div className="alert alert-danger" style={{ marginTop: 8, marginBottom: 0 }}>
          {failMessage ?? "Could not run connection test."}
        </div>
      )}
    </div>
  );
}

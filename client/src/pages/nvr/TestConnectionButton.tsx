import { useMutation } from "@tanstack/react-query";
import { AxiosResponse } from "axios";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";

interface GenericTestResult {
  reachable: boolean;
  latencyMs: number | null;
  protocolConfirmed: boolean;
  message: string;
}

interface IsapiTestResult {
  ok: boolean;
  info: { deviceName: string; model: string; serialNumber: string; firmwareVersion: string; deviceType: string } | null;
  message: string;
}

export interface LastKnownConnectionState {
  status: "ONLINE" | "OFFLINE" | "UNKNOWN";
  lastCheckedAt: string | null;
  latencyMs: number | null;
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function TestConnectionButton({
  ipAddress,
  port,
  httpPort,
  protocol,
  username,
  password,
  nvrId,
  cameraId,
  lastKnown,
}: {
  ipAddress: string;
  port: number | null;
  httpPort?: number | null;
  protocol?: string;
  username?: string;
  password?: string;
  // Present only when testing an already-saved NVR/Camera (edit mode) — the backend persists the
  // result onto that row so it's shown instantly next time. Never both set at once.
  nvrId?: number;
  cameraId?: number;
  // The row's persisted state from the last time it was tested (Test Connection, Check Status, or
  // a live-view session's pre-flight probe) — shown immediately on mount, before any fresh test
  // has run this session, so reopening the modal doesn't look like a blank slate.
  lastKnown?: LastKnownConnectionState;
}) {
  const isIsapi = protocol === "ISAPI";

  const mutation = useMutation<AxiosResponse<IsapiTestResult | GenericTestResult>, unknown, void>({
    mutationFn: () =>
      isIsapi
        ? axiosClient.post<IsapiTestResult>("/nvr/isapi/test-connection", {
            ipAddress,
            port: httpPort ?? undefined,
            username: username || undefined,
            password: password || undefined,
            nvrId,
          })
        : axiosClient.post<GenericTestResult>("/nvr/test-connection", { ipAddress, port, protocol, nvrId, cameraId }),
  });

  const data = mutation.data?.data;
  const failMessage = (mutation.error as any)?.response?.data?.error as string | undefined;
  const success = isIsapi ? (data as IsapiTestResult | undefined)?.ok : (data as GenericTestResult | undefined)?.reachable;
  const isapiInfo = isIsapi ? (data as IsapiTestResult | undefined)?.info : null;
  const genericResult = !isIsapi ? (data as GenericTestResult | undefined) : undefined;

  return (
    <div className="field">
      <label>Connection Test{isIsapi ? " (ISAPI)" : ""}</label>
      <button className="btn btn-secondary" type="button" disabled={!ipAddress || mutation.isPending} onClick={() => mutation.mutate()}>
        <Icon name="wifi" size={13} /> {mutation.isPending ? "Testing..." : "Test Connection"}
      </button>
      {!data && !mutation.isError && lastKnown?.lastCheckedAt && lastKnown.status !== "UNKNOWN" && (
        <div className={`alert ${lastKnown.status === "ONLINE" ? "alert-success" : "alert-danger"}`} style={{ marginTop: 8, marginBottom: 0 }}>
          Last known: {lastKnown.status === "ONLINE" ? "Online" : "Offline"} ({timeAgo(lastKnown.lastCheckedAt)}
          {lastKnown.status === "ONLINE" && lastKnown.latencyMs !== null ? `, ${lastKnown.latencyMs}ms` : ""})
        </div>
      )}
      {data && (
        <div className={`alert ${success ? "alert-success" : "alert-danger"}`} style={{ marginTop: 8, marginBottom: 0 }}>
          {data.message}
          {genericResult && genericResult.reachable && genericResult.latencyMs !== null && ` (${genericResult.latencyMs}ms)`}
          {isapiInfo && (isapiInfo.deviceName || isapiInfo.model) && ` — ${isapiInfo.deviceName || isapiInfo.model}${isapiInfo.firmwareVersion ? ` (fw ${isapiInfo.firmwareVersion})` : ""}`}
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

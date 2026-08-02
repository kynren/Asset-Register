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

export function TestConnectionButton({
  ipAddress,
  port,
  protocol,
  username,
  password,
}: {
  ipAddress: string;
  port: number | null;
  protocol?: string;
  username?: string;
  password?: string;
}) {
  const isIsapi = protocol === "ISAPI";

  const mutation = useMutation<AxiosResponse<IsapiTestResult | GenericTestResult>, unknown, void>({
    mutationFn: () =>
      isIsapi
        ? axiosClient.post<IsapiTestResult>("/nvr/isapi/test-connection", {
            ipAddress,
            port,
            username: username || undefined,
            password: password || undefined,
          })
        : axiosClient.post<GenericTestResult>("/nvr/test-connection", { ipAddress, port, protocol }),
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

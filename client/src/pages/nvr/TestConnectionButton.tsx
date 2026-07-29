import { useMutation } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";

interface TestResult {
  reachable: boolean;
  latencyMs: number | null;
  protocolConfirmed: boolean;
  message: string;
}

export function TestConnectionButton({ ipAddress, port, protocol }: { ipAddress: string; port: number | null; protocol?: string }) {
  const mutation = useMutation({
    mutationFn: () => axiosClient.post<TestResult>("/nvr/test-connection", { ipAddress, port, protocol }),
  });

  const result = mutation.data?.data;
  const failMessage = (mutation.error as any)?.response?.data?.error as string | undefined;

  return (
    <div className="field">
      <label>Connection Test</label>
      <button className="btn btn-secondary" type="button" disabled={!ipAddress || mutation.isPending} onClick={() => mutation.mutate()}>
        <Icon name="wifi" size={13} /> {mutation.isPending ? "Testing..." : "Test Connection"}
      </button>
      {result && (
        <div className={`alert ${result.reachable ? "alert-success" : "alert-danger"}`} style={{ marginTop: 8, marginBottom: 0 }}>
          {result.message}
          {result.reachable && result.latencyMs !== null && ` (${result.latencyMs}ms)`}
        </div>
      )}
      {mutation.isError && !result && (
        <div className="alert alert-danger" style={{ marginTop: 8, marginBottom: 0 }}>
          {failMessage ?? "Could not run connection test."}
        </div>
      )}
    </div>
  );
}

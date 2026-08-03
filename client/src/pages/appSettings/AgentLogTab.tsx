import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import dayjs from "dayjs";

interface AgentLogEntry {
  id: number;
  source: string;
  message: string;
  createdAt: string;
}

// Polls rather than streams — matches SystemStatusTab.tsx's refetchInterval convention rather
// than introducing a new SSE/WebSocket path just for this one tab. Rows come back newest-first
// from the server (GET /system/agent-log), reversed here so the log viewer reads top-to-bottom
// like a normal log file / terminal.
export function AgentLogTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["agent-log"],
    queryFn: async () => (await axiosClient.get<AgentLogEntry[]>("/system/agent-log")).data,
    refetchInterval: 5000,
  });

  const entries = [...(data ?? [])].reverse();

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <h3 className="mt-0 mb-0">Relay Agent Log</h3>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            Recent log lines uploaded by the on-prem network relay agent. Updates every 5 seconds. Entries older than 24 hours are pruned automatically.
          </p>
        </div>
      </div>

      {isLoading && <div className="muted">Loading...</div>}
      {!isLoading && entries.length === 0 && <div className="empty-state">No log entries yet — the relay agent hasn't reported in.</div>}

      {entries.length > 0 && (
        <div
          style={{
            background: "var(--color-surface-inset, #0d1117)",
            color: "var(--color-text-inverse, #c9d1d9)",
            borderRadius: 8,
            padding: 12,
            maxHeight: 560,
            overflowY: "auto",
            fontFamily: "var(--font-mono, monospace)",
            fontSize: 12,
            lineHeight: 1.6,
          }}
        >
          {entries.map((e) => (
            <div key={e.id} style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              <span style={{ opacity: 0.6 }}>{dayjs(e.createdAt).format("HH:mm:ss")}</span> {e.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

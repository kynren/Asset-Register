import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { getAccessToken } from "../../api/tokenStore";
import { Icon } from "../../components/Icon";
import { AddNodeModal, NodeFormValues } from "./AddNodeModal";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface GraphNodeOption {
  id: number;
  label: string;
  ipAddress: string | null;
}

interface ConsoleLine {
  id: number;
  kind: "reply" | "timeout" | "error" | "info";
  text: string;
}

const PACKET_OPTIONS: { value: number | "continuous"; label: string }[] = [
  { value: 1, label: "1" },
  { value: 4, label: "4" },
  { value: 8, label: "8" },
  { value: 12, label: "12" },
  { value: "continuous", label: "Cont." },
];

export function PingConsoleTab() {
  const queryClient = useQueryClient();
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [host, setHost] = useState("10.12.10.1");
  const [count, setCount] = useState<number | "continuous">(4);
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const lineIdRef = useRef(0);

  const { data: graph } = useQuery({
    queryKey: ["network-graph"],
    queryFn: async () => (await axiosClient.get("/network/graph")).data as { nodes: GraphNodeOption[]; edges: unknown[] },
  });

  const addNodeMutation = useMutation({
    mutationFn: (values: NodeFormValues) => axiosClient.post("/network/nodes", values),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["network-graph"] }); setShowAddDevice(false); },
  });

  const deviceOptions = (graph?.nodes ?? []).filter((n) => n.ipAddress);

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function appendLine(kind: ConsoleLine["kind"], text: string) {
    lineIdRef.current += 1;
    setLines((prev) => [...prev.slice(-200), { id: lineIdRef.current, kind, text }]);
  }

  async function startPing() {
    if (!host.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLines([]);
    setRunning(true);
    appendLine("info", `Pinging ${host} ${count === "continuous" ? "continuously" : `with ${count} packet(s)`}...`);

    try {
      const token = getAccessToken();
      const url = `/api/network/ping-stream?host=${encodeURIComponent(host.trim())}&count=${count}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        appendLine("error", body?.error ?? `Request failed (${res.status})`);
        setRunning(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const dataLine = part.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          try {
            const evt = JSON.parse(dataLine.slice(6));
            if (evt.type === "reply") {
              appendLine("reply", `Reply from ${evt.host ?? host}: ${evt.bytes ? `bytes=${evt.bytes} ` : ""}time=${evt.timeMs}ms${evt.ttl ? ` TTL=${evt.ttl}` : ""}`);
            } else if (evt.type === "timeout") {
              appendLine("timeout", "Request timed out.");
            } else if (evt.type === "error") {
              appendLine("error", evt.raw);
            } else if (evt.type === "done") {
              appendLine("info", "Ping sequence complete.");
            }
          } catch {
            // ignore malformed chunk boundary
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") appendLine("error", "Connection to ping stream lost.");
    } finally {
      setRunning(false);
    }
  }

  function stopPing() {
    abortRef.current?.abort();
    setRunning(false);
    appendLine("info", "Stopped by user.");
  }

  const lineColor: Record<ConsoleLine["kind"], string> = {
    reply: "#34d399",
    timeout: "#fbbf24",
    error: "#f87171",
    info: "#7b8497",
  };

  return (
    <div className="ad-shell">
      <div className="ad-content">
        <div className="ad-grid" style={{ gridTemplateColumns: "380px 1fr" }}>
      <div className="ad-panel">
        <div className="ad-panel-title">
          <span className="row gap-2"><Icon name="activity" size={14} /> Single-Device ICMP Pinger</span>
          <button className="ad-btn" onClick={() => setShowAddDevice(true)}><Icon name="plus" size={12} /> Add Device</button>
        </div>

        <div className="ad-field" style={{ marginBottom: 12 }}>
          <label>Quick Device Select</label>
          <select
            className="ad-select"
            value={selectedDeviceId}
            onChange={(e) => {
              setSelectedDeviceId(e.target.value);
              const node = deviceOptions.find((n) => String(n.id) === e.target.value);
              if (node?.ipAddress) setHost(node.ipAddress);
            }}
          >
            <option value="">-- Choose a Device --</option>
            {deviceOptions.map((n) => <option key={n.id} value={n.id}>{n.label} ({n.ipAddress})</option>)}
          </select>
        </div>

        <div className="ad-field" style={{ marginBottom: 12 }}>
          <label>Target IP / Host</label>
          <input className="ad-input" value={host} onChange={(e) => setHost(e.target.value)} placeholder="10.12.10.1" />
        </div>

        <div className="ad-field" style={{ marginBottom: 16 }}>
          <label>Packet Count</label>
          <div className="row gap-1">
            {PACKET_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                className={`ad-btn ${count === opt.value ? "ad-btn-primary" : ""}`}
                style={{ flex: 1 }}
                onClick={() => setCount(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {running ? (
          <button className="ad-btn ad-btn-danger" style={{ width: "100%" }} onClick={stopPing}>
            <Icon name="close" size={13} /> Stop
          </button>
        ) : (
          <button className="ad-btn ad-btn-primary" style={{ width: "100%", background: "#16a34a", borderColor: "#16a34a" }} disabled={!host.trim()} onClick={startPing}>
            <Icon name="activity" size={13} /> Ping Target
          </button>
        )}
      </div>

      <div className="ad-panel" style={{ display: "flex", flexDirection: "column" }}>
        <div className="ad-panel-title">
          Interactive Ping Console
          <span
            className={running ? "animate-topology-pulse" : undefined}
            style={{ width: 8, height: 8, borderRadius: "50%", background: running ? "#34d399" : "#4b5568" }}
          />
        </div>
        <div style={{ flex: 1, background: "#000", borderRadius: 8, padding: 14, fontFamily: "monospace", fontSize: 12, minHeight: 360, maxHeight: 480, overflowY: "auto" }}>
          {lines.length === 0 ? (
            <div style={{ color: "#4b5568", textAlign: "center", marginTop: 140 }}>
              Console idle. Enter host IP and execute ICMP Ping to trigger live replies.
            </div>
          ) : (
            lines.map((line) => (
              <div key={line.id} style={{ color: lineColor[line.kind] }}>{line.text}</div>
            ))
          )}
          <div ref={consoleEndRef} />
        </div>
      </div>

      {showAddDevice && (
        <AddNodeModal onClose={() => setShowAddDevice(false)} onSubmit={(v) => addNodeMutation.mutate(v)} submitting={addNodeMutation.isPending} />
      )}
        </div>
      </div>
    </div>
  );
}

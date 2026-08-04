import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { getAccessToken } from "../../api/tokenStore";
import { Icon } from "../../components/Icon";
import { AddNodeModal, NodeFormValues } from "./AddNodeModal";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useClientInfo } from "../../hooks/useClientInfo";
import { useUserPreference } from "../../hooks/useUserPreference";
import { useDebouncedCallback } from "../../hooks/useDebouncedCallback";
import { PermissionGate } from "../../auth/PermissionGate";
import {
  getPingSessionSnapshot,
  hydratePingHostIfEmpty,
  setPingCount,
  setPingHost,
  startPingSession,
  stopPingSession,
  subscribePingSession,
} from "../../lib/pingSession";

interface AssetDeviceOption {
  id: number;
  name: string;
  assetTag: string;
  staticIpAddress: string | null;
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
  const consoleRef = useRef<HTMLDivElement>(null);

  // Session state (host/count/running/lines) lives in a module-level singleton — see
  // client/src/lib/pingSession.ts — so navigating away mid-ping doesn't abort it and coming back
  // just re-subscribes to whatever's still running.
  const session = useSyncExternalStore(subscribePingSession, getPingSessionSnapshot);
  const { host, count, running, lines } = session;

  // Restored once per tab session: saved preference takes priority, observed-IP is the fallback
  // if nothing was ever saved. Both go through hydratePingHostIfEmpty, which only applies when the
  // singleton's host is still unset, so neither can clobber a value the user's already typed.
  const { value: savedHost, setValue: saveHostPref, isLoading: hostPrefLoading } = useUserPreference<string | null>("network.icmpPinger.host", null);
  useEffect(() => {
    if (!hostPrefLoading && savedHost) hydratePingHostIfEmpty(savedHost);
  }, [savedHost, hostPrefLoading]);

  const { data: clientInfo } = useClientInfo();
  useEffect(() => {
    if (!hostPrefLoading && clientInfo?.observedIp) hydratePingHostIfEmpty(clientInfo.observedIp);
  }, [clientInfo, hostPrefLoading]);

  const debouncedSaveHost = useDebouncedCallback((value: string) => saveHostPref(value), 600);
  useEffect(() => {
    if (host) debouncedSaveHost(host);
  }, [host, debouncedSaveHost]);

  const { data: assetDevices } = useQuery({
    queryKey: ["network-asset-devices"],
    queryFn: async () => (await axiosClient.get("/network/asset-devices")).data as AssetDeviceOption[],
  });

  const addNodeMutation = useMutation({
    mutationFn: (values: NodeFormValues) => axiosClient.post("/network/nodes", values),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["network-graph"] }); setShowAddDevice(false); },
  });

  const deviceOptions = (assetDevices ?? []).map((a) => ({ id: a.id, label: `${a.name} — ${a.assetTag}`, ipAddress: a.staticIpAddress }));

  // Scrolls only the console's own div to its bottom — the previous scrollIntoView({block:
  // "center"} implied by omitting `block`) walked every scrollable ancestor including the page
  // itself, which is what was yanking the whole screen upward on every streamed reply.
  useEffect(() => {
    const el = consoleRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  function startPing() {
    if (!host.trim()) return;
    startPingSession(host, count, getAccessToken());
  }

  function stopPing() {
    stopPingSession();
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
          <PermissionGate module="network" action="create">
            <button className="ad-btn" onClick={() => setShowAddDevice(true)}><Icon name="plus" size={12} /> Add Device</button>
          </PermissionGate>
        </div>

        <div className="ad-field" style={{ marginBottom: 12 }}>
          <label>Quick Device Select</label>
          <select
            className="ad-select"
            value={selectedDeviceId}
            onChange={(e) => {
              setSelectedDeviceId(e.target.value);
              const node = deviceOptions.find((n) => String(n.id) === e.target.value);
              if (node?.ipAddress) setPingHost(node.ipAddress);
            }}
          >
            <option value="">-- Choose a Device --</option>
            {deviceOptions.map((n) => <option key={n.id} value={n.id}>{n.label} ({n.ipAddress})</option>)}
          </select>
        </div>

        <div className="ad-field" style={{ marginBottom: 12 }}>
          <label>Target IP / Host</label>
          <input className="ad-input" value={host} onChange={(e) => setPingHost(e.target.value)} placeholder="10.12.10.1" disabled={running} />
        </div>

        <div className="ad-field" style={{ marginBottom: 16 }}>
          <label>Packet Count</label>
          <div className="row gap-1">
            {PACKET_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                className={`ad-btn ${count === opt.value ? "ad-btn-primary" : ""}`}
                style={{ flex: 1 }}
                onClick={() => setPingCount(opt.value)}
                disabled={running}
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
        <div ref={consoleRef} style={{ flex: 1, background: "#000", borderRadius: 8, padding: 14, fontFamily: "monospace", fontSize: 12, minHeight: 360, maxHeight: 480, overflowY: "auto" }}>
          {lines.length === 0 ? (
            <div style={{ color: "#4b5568", textAlign: "center", marginTop: 140 }}>
              Console idle. Enter host IP and execute ICMP Ping to trigger live replies.
            </div>
          ) : (
            lines.map((line) => (
              <div key={line.id} style={{ color: lineColor[line.kind] }}>{line.text}</div>
            ))
          )}
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

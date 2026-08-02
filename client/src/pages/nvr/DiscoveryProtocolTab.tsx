import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { PermissionGate } from "../../auth/PermissionGate";

interface Nvr {
  id: number;
  name: string;
  ipAddress: string | null;
  protocol: string | null;
}
interface DiscoveredChannel {
  name: string;
  channelNumber?: number;
  channel?: number;
  streamUri: string | null;
  snapshotUri?: string | null;
}

// Standalone home for NVR channel discovery — runs the same real ONVIF/ISAPI discovery the
// Add/Edit NVR form uses, but against an already-saved NVR's own stored credentials (decrypted
// server-side), so no password re-entry is needed here.
export function DiscoveryProtocolTab() {
  const queryClient = useQueryClient();
  const { data: nvrs, isLoading } = useQuery({
    queryKey: ["nvrs"],
    queryFn: async () => (await axiosClient.get("/nvr")).data as Nvr[],
  });
  const [nvrId, setNvrId] = useState<number | "">("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const selectedNvr = nvrs?.find((n) => n.id === nvrId);

  const discoverMutation = useMutation({
    mutationFn: async () => (await axiosClient.post(`/nvr/${nvrId}/discover-channels`)).data,
    onSuccess: () => setSelected(new Set()),
  });

  const importMutation = useMutation({
    mutationFn: (channels: DiscoveredChannel[]) =>
      axiosClient.post(`/nvr/${nvrId}/import-cameras`, {
        channels: channels.map((ch) => ({ name: ch.name, streamUri: ch.streamUri, channel: ch.channelNumber ?? ch.channel ?? null })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nvrs"] });
      discoverMutation.reset();
      setSelected(new Set());
    },
  });

  const channels: DiscoveredChannel[] = discoverMutation.data?.channels ?? [];
  const message: string | undefined = discoverMutation.data?.message;
  const protocolUsed: string | undefined = discoverMutation.data?.protocol;

  function toggle(i: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <div className="ad-shell nvx-shell" style={{ padding: 22 }}>
      <div className="ad-content-header">
        <h2 className="ad-content-title"><Icon name="radar" size={16} /> Discovery Protocol</h2>
        <p className="ad-content-subtitle">
          Discover the real camera channels an NVR/DVR manages via ONVIF or Hikvision ISAPI (matching iVMS-4200's own
          "get groups" call), then import them as cameras.
        </p>
      </div>

      <div className="ad-panel" style={{ maxWidth: 640 }}>
        <div className="ad-field" style={{ marginBottom: 12 }}>
          <label>NVR / DVR</label>
          <select className="ad-select" value={nvrId} onChange={(e) => { setNvrId(e.target.value ? Number(e.target.value) : ""); discoverMutation.reset(); }}>
            <option value="">Select an NVR to scan...</option>
            {(nvrs ?? []).map((n) => (
              <option key={n.id} value={n.id}>{n.name} — {n.ipAddress ?? "no IP set"} ({n.protocol ?? "RTSP"})</option>
            ))}
          </select>
        </div>

        <button className="ad-btn ad-btn-primary" disabled={!nvrId || !selectedNvr?.ipAddress || discoverMutation.isPending} onClick={() => discoverMutation.mutate()}>
          <Icon name="search" size={13} /> {discoverMutation.isPending ? "Scanning..." : "Run Discovery"}
        </button>

        {message && (
          <div className={`alert ${channels.length > 0 ? "alert-success" : "alert-warning"}`} style={{ marginTop: 12 }}>
            {protocolUsed && <strong style={{ marginRight: 6 }}>[{protocolUsed}]</strong>}
            {message}
          </div>
        )}

        {channels.length > 0 && (
          <>
            <div className="stack gap-1" style={{ marginTop: 12, maxHeight: 260, overflowY: "auto" }}>
              {channels.map((ch, i) => (
                <label key={i} className="row gap-2" style={{ padding: "8px 10px", border: "1px solid var(--ad-border)", borderRadius: 6, cursor: "pointer" }}>
                  <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {(ch.channelNumber ?? ch.channel) != null ? `Ch. ${ch.channelNumber ?? ch.channel} — ` : ""}{ch.name}
                    </div>
                    <div className="muted" style={{ fontSize: 11 }}>{ch.streamUri ?? "No stream URI reported"}</div>
                  </div>
                </label>
              ))}
            </div>
            <PermissionGate module="nvr" action="create">
              <button
                className="ad-btn ad-btn-primary"
                style={{ marginTop: 10 }}
                disabled={selected.size === 0 || importMutation.isPending}
                onClick={() => importMutation.mutate(channels.filter((_, i) => selected.has(i)))}
              >
                <Icon name="download" size={13} /> Import {selected.size || ""} Selected
              </button>
            </PermissionGate>
          </>
        )}
        {importMutation.isSuccess && <div className="alert alert-success" style={{ marginTop: 10 }}>Cameras imported — check Config Server or the Live Video Matrix.</div>}
      </div>

      {!isLoading && (nvrs ?? []).length === 0 && <div className="ad-empty">No NVRs registered yet — add one in Config Server first.</div>}
    </div>
  );
}

import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { MatrixTile } from "./MatrixTile";
import { PtzAlignmentPanel } from "./PtzAlignmentPanel";

interface Camera {
  id: number;
  nvrId: number;
  name: string;
  channel: number | null;
  location: string | null;
  ipAddress: string | null;
  port: number | null;
  ptzEnabled: boolean;
  status: string;
  streamUrl: string | null;
}
interface Nvr {
  id: number;
  name: string;
  ipAddress: string | null;
  status: string;
  cameras: Camera[];
}
interface ClientInfo {
  observedIp: string;
  host: string;
}

const GRID_SIZES = [
  { key: 1 as const, label: "1x1" },
  { key: 4 as const, label: "2x2" },
  { key: 9 as const, label: "3x3" },
];

function subnetOf(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}.x/24`;
}

export function LiveVideoMatrixTab() {
  const { data: nvrs, isLoading } = useQuery({
    queryKey: ["nvrs"],
    queryFn: async () => (await axiosClient.get("/nvr")).data as Nvr[],
  });
  const { data: clientInfo } = useQuery({
    queryKey: ["system-client-info-matrix"],
    queryFn: async () => (await axiosClient.get("/system/client-info")).data as ClientInfo,
  });

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "PTZ" | "FIXED">("ALL");
  const [subnetFilter, setSubnetFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ONLINE" | "OFFLINE" | "UNKNOWN">("ALL");
  const [groupFilter, setGroupFilter] = useState("ALL");

  const [gridSize, setGridSize] = useState<1 | 4 | 9>(4);
  const [slots, setSlots] = useState<(number | null)[]>(Array(4).fill(null));
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [muted, setMuted] = useState(true);
  const gridRef = useRef<HTMLDivElement>(null);
  const snapFnsRef = useRef<Map<number, () => void>>(new Map());

  const allCameras = useMemo(() => (nvrs ?? []).flatMap((n) => n.cameras), [nvrs]);

  const subnets = useMemo(
    () => Array.from(new Set(allCameras.map((c) => subnetOf(c.ipAddress)).filter((s): s is string => !!s))).sort(),
    [allCameras]
  );

  const visibleCameraIds = useMemo(() => {
    const q = search.trim().toLowerCase();
    const set = new Set<number>();
    for (const c of allCameras) {
      if (q && !`${c.name} ${c.ipAddress ?? ""} ${c.location ?? ""}`.toLowerCase().includes(q)) continue;
      if (typeFilter === "PTZ" && !c.ptzEnabled) continue;
      if (typeFilter === "FIXED" && c.ptzEnabled) continue;
      if (subnetFilter !== "ALL" && subnetOf(c.ipAddress) !== subnetFilter) continue;
      if (statusFilter !== "ALL" && c.status !== statusFilter) continue;
      if (groupFilter !== "ALL" && String(c.nvrId) !== groupFilter) continue;
      set.add(c.id);
    }
    return set;
  }, [allCameras, search, typeFilter, subnetFilter, statusFilter, groupFilter]);

  function changeGridSize(size: 1 | 4 | 9) {
    setGridSize(size);
    setSlots((prev) => {
      const next: (number | null)[] = Array(size).fill(null);
      for (let i = 0; i < Math.min(prev.length, size); i++) next[i] = prev[i];
      return next;
    });
    setFocusedIndex(null);
  }

  function assignCamera(cameraId: number) {
    setSlots((prev) => {
      const next = [...prev];
      const emptyIndex = next.findIndex((s) => s === null);
      const idx = focusedIndex !== null ? focusedIndex : emptyIndex === -1 ? 0 : emptyIndex;
      next[idx] = cameraId;
      setFocusedIndex(idx);
      return next;
    });
  }

  function clearSlot(index: number) {
    setSlots((prev) => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
    if (focusedIndex === index) setFocusedIndex(null);
  }

  function registerSnap(index: number, fn: (() => void) | null) {
    if (fn) snapFnsRef.current.set(index, fn);
    else snapFnsRef.current.delete(index);
  }

  function snapFocused() {
    if (focusedIndex === null) return;
    snapFnsRef.current.get(focusedIndex)?.();
  }

  function toggleFullscreen() {
    if (!gridRef.current) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else gridRef.current.requestFullscreen().catch(() => undefined);
  }

  const focusedCamera = focusedIndex !== null && slots[focusedIndex] != null ? allCameras.find((c) => c.id === slots[focusedIndex]) ?? null : null;
  const gridCols = gridSize === 1 ? 1 : gridSize === 4 ? 2 : 3;
  const totalNodes = (nvrs?.length ?? 0) + allCameras.length;

  return (
    <div className="ad-shell nvx-shell">
      <div className="nvx-topbar">
        <div className="nvx-search-box">
          <Icon name="search" size={14} />
          <input
            placeholder="Search cameras by name, IP address, or location (e.g., Gate, Stage, Dome)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="nvx-query-status">
          Query Status:
          <span className="nvx-query-status-pill">{isLoading ? "INDEXING..." : `ALL ${totalNodes} NODES INDEXED`}</span>
        </div>
      </div>

      <div className="nvx-filterbar">
        <div className="nvx-filter-field">
          <label>Camera Type</label>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}>
            <option value="ALL">All Models/Types</option>
            <option value="PTZ">PTZ Cameras</option>
            <option value="FIXED">Fixed Cameras</option>
          </select>
        </div>
        <div className="nvx-filter-field">
          <label>Subnet Segment</label>
          <select value={subnetFilter} onChange={(e) => setSubnetFilter(e.target.value)}>
            <option value="ALL">All Subnets</option>
            {subnets.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="nvx-filter-field">
          <label>Link Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
            <option value="ALL">All States</option>
            <option value="ONLINE">Online</option>
            <option value="OFFLINE">Offline</option>
            <option value="UNKNOWN">Unknown</option>
          </select>
        </div>
        <div className="nvx-filter-field">
          <label>Camera Group</label>
          <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
            <option value="ALL">All Groups</option>
            {(nvrs ?? []).map((n) => (
              <option key={n.id} value={String(n.id)}>{n.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="nvx-body">
        <div className="nvx-sidebar">
          <div className="nvx-panel-title"><Icon name="hardDrive" size={13} /> Device Channel List</div>

          <div className="nvx-scan-card">
            <div className="nvx-scan-card-label">Linked Scan Segment</div>
            <div className="nvx-scan-row"><span>Agent Node IP:</span><span>{clientInfo?.observedIp ?? "—"}</span></div>
            <div className="nvx-scan-row"><span>Network Segment:</span><span>{subnetOf(clientInfo?.observedIp) ?? "—"}</span></div>
            <div className="nvx-scan-row"><span>Active NVR:</span><span>{nvrs?.[0]?.name ?? "—"}</span></div>
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {(nvrs ?? []).map((n) => (
              <div key={n.id} style={{ marginBottom: 14 }}>
                <div className="nvx-group-header">
                  <span className={`nvx-group-dot ${n.status === "ONLINE" ? "online" : n.status === "OFFLINE" ? "offline" : "unknown"}`} />
                  {n.name}
                </div>
                {n.cameras.filter((c) => visibleCameraIds.has(c.id)).map((c) => (
                  <button key={c.id} type="button" className={`nvx-channel-item ${slots.includes(c.id) ? "selected" : ""}`} onClick={() => assignCamera(c.id)}>
                    <span>{c.name}</span>
                    <span className={`nvx-channel-status ${c.status === "ONLINE" ? "live" : "inact"}`}>
                      {c.status === "ONLINE" ? "LIVE" : c.status}
                    </span>
                  </button>
                ))}
                {n.cameras.length === 0 && <div className="muted" style={{ fontSize: 11, padding: "4px 8px" }}>No cameras added yet.</div>}
              </div>
            ))}
            {!isLoading && (nvrs ?? []).length === 0 && <div className="muted" style={{ fontSize: 12 }}>No NVRs registered yet.</div>}
          </div>

          <div className="nvx-matrix-controls">
            <div className="nvx-section-label">Matrix Controls</div>
            <div className="nvx-grid-size-row">
              {GRID_SIZES.map((g) => (
                <button key={g.key} type="button" className={`nvx-grid-size-btn ${gridSize === g.key ? "active" : ""}`} onClick={() => changeGridSize(g.key)}>
                  {g.label}
                </button>
              ))}
            </div>
            <div className="nvx-toggle-row">
              <button type="button" className={`nvx-toggle-btn ${muted ? "" : "on"}`} onClick={() => setMuted((m) => !m)}>
                <Icon name={muted ? "close" : "check"} size={11} /> {muted ? "Audio Muted" : "Audio On"}
              </button>
              <button type="button" className="nvx-toggle-btn" onClick={snapFocused} disabled={focusedIndex === null}>
                <Icon name="camera" size={11} /> Snap Frame
              </button>
            </div>
            <button type="button" className="nvx-expand-btn" onClick={toggleFullscreen}>
              <Icon name="maximize" size={12} /> Expand Grid (Full Screen)
            </button>
          </div>
        </div>

        <div className="nvx-main">
          <div className="nvx-grid" ref={gridRef} style={{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }}>
            {slots.map((camId, i) => {
              const cam = camId != null ? allCameras.find((c) => c.id === camId) : null;
              return cam ? (
                <MatrixTile
                  key={i}
                  slotIndex={i}
                  camera={cam}
                  focused={focusedIndex === i}
                  muted={muted}
                  onFocus={() => setFocusedIndex(i)}
                  onClose={() => clearSlot(i)}
                  registerSnap={registerSnap}
                />
              ) : (
                <div key={i} className={`nvx-tile ${focusedIndex === i ? "focused" : ""}`} onClick={() => setFocusedIndex(i)}>
                  <div className="nvx-tile-empty">
                    <Icon name="camera" size={22} />
                    Select a channel from the list
                  </div>
                </div>
              );
            })}
          </div>

          <div className="nvx-audit-panel">
            <Icon name="activity" size={16} />
            <div>
              <strong>Network Traffic Audit</strong> — RTSP streams are routing through the Endpoint Security Agent{" "}
              <strong>{clientInfo?.host ?? "localhost"}</strong>. Network activities, socket connections, and camera handshakes
              originate from Node IP <span className="nvx-audit-ip">{clientInfo?.observedIp ?? "—"}</span>.
            </div>
          </div>
        </div>

        <div className="nvx-ptz-col">
          <PtzAlignmentPanel
            camera={focusedCamera ? { id: focusedCamera.id, name: focusedCamera.name, ipAddress: focusedCamera.ipAddress, ptzEnabled: focusedCamera.ptzEnabled } : null}
          />
        </div>
      </div>
    </div>
  );
}

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Background,
  Connection,
  Edge,
  MiniMap,
  Node,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { PermissionGate } from "../../auth/PermissionGate";
import { AddNodeModal, NodeFormValues } from "./AddNodeModal";
import { layoutGraph } from "./layout";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { SkeletonBlock } from "../../components/Skeleton";

interface GraphNode {
  id: number;
  type: string;
  role: string | null;
  label: string;
  ipAddress: string | null;
  subnet: string | null;
  vendor: string | null;
  deviceType: string | null;
  online: boolean | null;
  lastSeen: string | null;
  latencyMs: number | null;
  liveStatus: "ONLINE" | "DEGRADED" | "OFFLINE" | null;
}
interface GraphEdge {
  id: number;
  sourceId: number;
  targetId: number;
  label: string | null;
  bandwidthMbps: number | null;
}

// Device reachability convention app-wide: ONLINE is red, OFFLINE is green (see .status-flash /
// .tag-dot in global.css) — deliberately inverted from the usual instinct so a device coming
// online draws the eye. DEGRADED sits outside that binary and keeps its own amber.
const STATUS_COLOR: Record<string, string> = { ONLINE: "#ef4444", DEGRADED: "#f59e0b", OFFLINE: "#22c55e" };
const ROLE_LABEL: Record<string, string> = {
  CORE_SWITCH: "Core Switch",
  DISTRIBUTION_SWITCH: "Distribution Switch",
  EDGE_SWITCH: "Edge Switch",
  GATEWAY_ROUTER: "Gateway Router",
  HARDWARE_HOST: "Hardware Host",
};
const CLUSTER_PALETTE = ["#a855f7", "#ec4899", "#14b8a6", "#f97316", "#eab308", "#84cc16"];

function heatColor(latencyMs: number | null): string {
  if (latencyMs === null) return "#667085";
  const t = Math.min(1, latencyMs / 150);
  const r = Math.round(34 + t * (239 - 34));
  const g = Math.round(197 - t * (197 - 68));
  const b = Math.round(94 - t * (94 - 68));
  return `rgb(${r},${g},${b})`;
}

function InnerTopologyGraph() {
  const queryClient = useQueryClient();
  const reactFlow = useReactFlow();
  const wrapRef = useRef<HTMLDivElement>(null);

  const [showAddNode, setShowAddNode] = useState(false);
  const [showNodeLabels, setShowNodeLabels] = useState(true);
  const [showBandwidthLabels, setShowBandwidthLabels] = useState(false);
  const [pathTracerActive, setPathTracerActive] = useState(false);
  const [pathTracerPicks, setPathTracerPicks] = useState<number[]>([]);
  const [tracedPath, setTracedPath] = useState<{ nodeIds: Set<number>; edgeIds: Set<number> } | null>(null);
  const [clustersOn, setClustersOn] = useState(false);
  const [highlightQuery, setHighlightQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ONLINE" | "DEGRADED" | "OFFLINE">("ALL");
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [legendCollapsed, setLegendCollapsed] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [animateEdges, setAnimateEdges] = useState(true);
  const [showMinimap, setShowMinimap] = useState(true);
  const [heatmapOn, setHeatmapOn] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [deletingEdgeId, setDeletingEdgeId] = useState<number | null>(null);
  const [confirmingNodeDelete, setConfirmingNodeDelete] = useState(false);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["network-graph"],
    queryFn: async () => (await axiosClient.get("/network/graph")).data as { nodes: GraphNode[]; edges: GraphEdge[] },
    refetchInterval: 30_000,
  });

  const addNodeMutation = useMutation({
    mutationFn: (values: NodeFormValues) => axiosClient.post("/network/nodes", values),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["network-graph"] }); setShowAddNode(false); },
  });

  const addEdgeMutation = useMutation({
    mutationFn: (params: { sourceId: number; targetId: number }) => axiosClient.post("/network/edges", params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["network-graph"] }),
  });

  const deleteEdgeMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/network/edges/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["network-graph"] }); setDeletingEdgeId(null); },
  });

  const deleteNodeMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/network/nodes/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["network-graph"] }); setSelectedNodeId(null); setConfirmingNodeDelete(false); },
  });

  const allNodes = useMemo(() => data?.nodes ?? [], [data]);
  const allEdges = useMemo(() => data?.edges ?? [], [data]);

  const statusCounts = useMemo(() => {
    const counts = { ALL: allNodes.length, ONLINE: 0, DEGRADED: 0, OFFLINE: 0 };
    for (const n of allNodes) if (n.liveStatus) counts[n.liveStatus] += 1;
    return counts;
  }, [allNodes]);

  const subnetList = useMemo(() => Array.from(new Set(allNodes.map((n) => n.subnet).filter((s): s is string => Boolean(s)))).sort(), [allNodes]);
  function clusterColor(subnet: string | null): string {
    if (!subnet) return "#667085";
    const idx = subnetList.indexOf(subnet);
    return CLUSTER_PALETTE[idx % CLUSTER_PALETTE.length];
  }

  const visibleNodes = useMemo(
    () => (statusFilter === "ALL" ? allNodes : allNodes.filter((n) => n.liveStatus === statusFilter)),
    [allNodes, statusFilter]
  );
  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);
  const visibleEdges = useMemo(() => allEdges.filter((e) => visibleIds.has(e.sourceId) && visibleIds.has(e.targetId)), [allEdges, visibleIds]);

  const matchedIds = useMemo(() => {
    if (!highlightQuery.trim()) return null;
    const q = highlightQuery.trim().toLowerCase();
    return new Set(allNodes.filter((n) => n.label.toLowerCase().includes(q) || (n.ipAddress ?? "").includes(q)).map((n) => n.id));
  }, [allNodes, highlightQuery]);

  function computeTracedPath(startId: number, endId: number) {
    const adjacency = new Map<number, { neighbor: number; edgeId: number }[]>();
    for (const e of allEdges) {
      if (!adjacency.has(e.sourceId)) adjacency.set(e.sourceId, []);
      if (!adjacency.has(e.targetId)) adjacency.set(e.targetId, []);
      adjacency.get(e.sourceId)!.push({ neighbor: e.targetId, edgeId: e.id });
      adjacency.get(e.targetId)!.push({ neighbor: e.sourceId, edgeId: e.id });
    }
    const visited = new Set([startId]);
    const queue: number[][] = [[startId]];
    const edgeTrail = new Map<number, number>();
    while (queue.length) {
      const path = queue.shift()!;
      const current = path[path.length - 1];
      if (current === endId) {
        const edgeIds = new Set<number>();
        for (let i = 1; i < path.length; i++) {
          const trail = edgeTrail.get(path[i]);
          if (trail !== undefined) edgeIds.add(trail);
        }
        setTracedPath({ nodeIds: new Set(path), edgeIds });
        return;
      }
      for (const { neighbor, edgeId } of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          edgeTrail.set(neighbor, edgeId);
          queue.push([...path, neighbor]);
        }
      }
    }
    setTracedPath(null);
  }

  const { initialNodes, initialEdges } = useMemo(() => {
    const rfNodes: Node[] = visibleNodes.map((n) => {
      const dimmed = (matchedIds && !matchedIds.has(n.id)) || (tracedPath && !tracedPath.nodeIds.has(n.id));
      const borderColor = clustersOn && n.subnet ? clusterColor(n.subnet) : heatmapOn ? heatColor(n.latencyMs) : n.liveStatus ? STATUS_COLOR[n.liveStatus] : "#4b5568";
      const isSelected = selectedNodeId === n.id;
      const roleLabel = n.role ? ROLE_LABEL[n.role] : null;
      return {
        id: String(n.id),
        position: { x: 0, y: 0 },
        data: { label: showNodeLabels ? `${n.label}${n.ipAddress ? `\n${n.ipAddress}` : ""}${roleLabel ? `\n${roleLabel}` : ""}` : "" },
        style: {
          border: `2px solid ${borderColor}`,
          borderRadius: 8,
          padding: 8,
          fontSize: 11,
          background: "var(--ad-surface)",
          color: "var(--ad-text)",
          whiteSpace: "pre-line",
          textAlign: "center",
          opacity: dimmed ? 0.25 : 1,
          boxShadow: isSelected ? `0 0 0 3px ${borderColor}66` : matchedIds?.has(n.id) ? "0 0 0 3px rgba(59,130,246,0.5)" : undefined,
          minWidth: showNodeLabels ? 140 : 44,
          minHeight: showNodeLabels ? 50 : 44,
        },
      };
    });

    const rfEdges: Edge[] = visibleEdges.map((e) => {
      const isTraced = tracedPath?.edgeIds.has(e.id);
      const dimByTrace = tracedPath && !isTraced;
      return {
        id: String(e.id),
        source: String(e.sourceId),
        target: String(e.targetId),
        label: showBandwidthLabels && e.bandwidthMbps ? `${e.bandwidthMbps} Mbps` : undefined,
        animated: animateEdges,
        style: { stroke: isTraced ? "#3b82f6" : "#34d399", strokeWidth: isTraced ? 3 : 1.5, opacity: dimByTrace ? 0.2 : 1 },
        labelStyle: { fill: "var(--ad-text-muted)", fontSize: 10 },
      };
    });

    return { initialNodes: layoutGraph(rfNodes, rfEdges), initialEdges: rfEdges };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleNodes, visibleEdges, showNodeLabels, showBandwidthLabels, clustersOn, heatmapOn, matchedIds, tracedPath, selectedNodeId, animateEdges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useMemo(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNodes, initialEdges]);

  function onConnect(connection: Connection) {
    setEdges((eds) => addEdge(connection, eds));
    if (connection.source && connection.target) {
      addEdgeMutation.mutate({ sourceId: Number(connection.source), targetId: Number(connection.target) });
    }
  }

  function handleNodeClick(_: unknown, node: Node) {
    const id = Number(node.id);
    if (pathTracerActive) {
      setPathTracerPicks((prev) => {
        const next = [...prev, id].slice(-2);
        if (next.length === 2) computeTracedPath(next[0], next[1]);
        else setTracedPath(null);
        return next;
      });
    } else {
      setSelectedNodeId(id);
    }
  }

  function handleEdgeClick(_: unknown, edge: Edge) {
    if (pathTracerActive) return;
    setDeletingEdgeId(Number(edge.id));
  }

  function togglePathTracer() {
    setPathTracerActive((v) => !v);
    setPathTracerPicks([]);
    setTracedPath(null);
    setSelectedNodeId(null);
  }

  function refreshLayout() {
    setNodes((nds) => layoutGraph(nds, edges));
  }

  const selectedNode = selectedNodeId ? allNodes.find((n) => n.id === selectedNodeId) ?? null : null;

  return (
    <div className="ad-shell nt-shell">
      <div className="nt-toolbar">
        <div className="nt-toolbar-row">
          <div className="nt-toolbar-label"><Icon name="network" size={14} /> Node &amp; Map Tools</div>
          <label className="nt-checkbox-pill">
            <input type="checkbox" checked={showNodeLabels} onChange={(e) => setShowNodeLabels(e.target.checked)} /> Node Labels
          </label>
          <label className="nt-checkbox-pill">
            <input type="checkbox" checked={showBandwidthLabels} onChange={(e) => setShowBandwidthLabels(e.target.checked)} /> Link Bandwidth Labels
          </label>
          <button className={`nt-tool-btn ${pathTracerActive ? "active" : ""}`} onClick={togglePathTracer}>
            <Icon name="route" size={13} /> Path Tracer
          </button>
          <button className={`nt-tool-btn ${clustersOn ? "active" : ""}`} onClick={() => setClustersOn((v) => !v)}>
            <Icon name="layersStack" size={13} /> Clusters ({subnetList.length})
          </button>
          <div className="nt-search-box">
            <Icon name="search" size={13} />
            <input placeholder="Highlight node..." value={highlightQuery} onChange={(e) => setHighlightQuery(e.target.value)} />
          </div>
        </div>

        <div className="nt-filter-row">
          {(["ALL", "ONLINE", "DEGRADED", "OFFLINE"] as const).map((key) => (
            <button key={key} className={`nt-filter-pill ${statusFilter === key ? "active" : ""}`} onClick={() => setStatusFilter(key)}>
              {key !== "ALL" && <span className={`nt-filter-dot ${key === "ONLINE" || key === "OFFLINE" ? "status-flash" : ""}`} style={{ background: STATUS_COLOR[key] }} />}
              {key === "ALL" ? "All Devices" : `${key.charAt(0)}${key.slice(1).toLowerCase()} Only`}
              <span className="nt-filter-count">{statusCounts[key]}</span>
            </button>
          ))}
          <div className="nt-filter-spacer" />
          <button className="nt-tool-btn" disabled={isFetching} onClick={() => refetch()}>
            <Icon name="refresh" size={13} /> {isFetching ? "Refreshing..." : "Refresh Layout"}
          </button>
          <PermissionGate module="network" action="create">
            <button className="nt-tool-btn active" onClick={() => setShowAddNode(true)}>
              <Icon name="plus" size={13} /> Add Node
            </button>
          </PermissionGate>
        </div>
      </div>

      <div className="nt-body">
        <div className={`nt-legend ${legendCollapsed ? "nt-legend-collapsed" : ""}`}>
          {legendCollapsed ? (
            <button className="nt-icon-btn" onClick={() => setLegendCollapsed(false)}><Icon name="chevronRight" size={14} /></button>
          ) : (
            <>
              <div className="nt-legend-header">
                <span className="nt-legend-title">Topology Legend</span>
                <button className="nt-legend-hide" onClick={() => setLegendCollapsed(true)}>Hide</button>
              </div>

              <div className="nt-legend-section">Node Status Colors</div>
              <div className="nt-legend-item"><span className="nt-legend-dot status-flash" style={{ background: STATUS_COLOR.ONLINE }} /> Online (Normal Latency)</div>
              <div className="nt-legend-item"><span className="nt-legend-dot" style={{ background: STATUS_COLOR.DEGRADED }} /> Degraded (Moderate Loss/RTT)</div>
              <div className="nt-legend-item"><span className="nt-legend-dot status-flash" style={{ background: STATUS_COLOR.OFFLINE }} /> Offline (No Response)</div>

              <div className="nt-legend-section">Node Role Icons</div>
              {Object.entries(ROLE_LABEL).map(([key, label]) => (
                <div key={key} className="nt-legend-item"><span className="nt-legend-icon"><Icon name="diamond" size={11} /></span> {label}</div>
              ))}

              <div className="nt-legend-section">Link Latency Status</div>
              <div className="nt-legend-item"><span className="nt-legend-line" style={{ borderColor: "#34d399" }} /> Excellent (≤ 15ms)</div>
              <div className="nt-legend-item"><span className="nt-legend-line" style={{ borderColor: "#a3e635" }} /> Good (16 - 50ms)</div>
              <div className="nt-legend-item"><span className="nt-legend-line" style={{ borderColor: "#f59e0b" }} /> Moderate (51 - 100ms)</div>
              <div className="nt-legend-item"><span className="nt-legend-line" style={{ borderColor: "#f87171" }} /> Critical (&gt; 100ms)</div>
              <div className="nt-legend-item"><span className="nt-legend-line" style={{ borderColor: "#4b5568" }} /> Offline Link</div>
            </>
          )}
        </div>

        <div className={`nt-canvas-wrap ${isFullscreen ? "fullscreen" : ""}`} ref={wrapRef}>
          {isLoading ? (
            <div style={{ padding: 16 }}><SkeletonBlock height={420} /></div>
          ) : allNodes.length === 0 ? (
            <div className="ad-empty">
              No devices or nodes yet. Run the Kynren agent on a machine, discover hosts with the IP Range Scanner, or add
              infrastructure nodes manually.
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={handleNodeClick}
              onEdgeClick={handleEdgeClick}
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background color="var(--ad-border)" gap={18} />
              {showMinimap && <MiniMap style={{ background: "var(--ad-surface-2)" }} maskColor="rgba(0,0,0,0.6)" />}
            </ReactFlow>
          )}

          {showSettings && (
            <div className="nt-settings-popover">
              <label className="nt-checkbox-pill" style={{ marginBottom: 10 }}>
                <input type="checkbox" checked={animateEdges} onChange={(e) => setAnimateEdges(e.target.checked)} /> Animate links
              </label>
              <label className="nt-checkbox-pill">
                <input type="checkbox" checked={showMinimap} onChange={(e) => setShowMinimap(e.target.checked)} /> Show minimap
              </label>
            </div>
          )}

          <div className="nt-bottom-bar">
            <button className={`nt-icon-btn ${showSettings ? "active" : ""}`} title="Settings" onClick={() => setShowSettings((v) => !v)}><Icon name="settings" size={15} /></button>
            <button className="nt-icon-btn" title="Refresh" onClick={() => refetch()}><Icon name="refresh" size={15} /></button>
            <button className={`nt-icon-btn ${heatmapOn ? "active" : ""}`} title="Heatmap" onClick={() => setHeatmapOn((v) => !v)}><Icon name="activity" size={15} /></button>
            <div className="nt-bottom-divider" />
            <button className="nt-icon-btn" title="Pan left" onClick={() => reactFlow.setViewport({ ...reactFlow.getViewport(), x: reactFlow.getViewport().x + 60 })}><Icon name="chevronLeft" size={15} /></button>
            <button className="nt-icon-btn" title="Pan up" onClick={() => reactFlow.setViewport({ ...reactFlow.getViewport(), y: reactFlow.getViewport().y + 60 })}><Icon name="arrowUp" size={15} /></button>
            <button className="nt-icon-btn" title="Pan down" onClick={() => reactFlow.setViewport({ ...reactFlow.getViewport(), y: reactFlow.getViewport().y - 60 })}><Icon name="arrowDown" size={15} /></button>
            <button className="nt-icon-btn" title="Pan right" onClick={() => reactFlow.setViewport({ ...reactFlow.getViewport(), x: reactFlow.getViewport().x - 60 })}><Icon name="chevronRight" size={15} /></button>
            <div className="nt-bottom-divider" />
            <button className="nt-icon-btn" title="Zoom in" onClick={() => reactFlow.zoomIn()}><Icon name="zoomIn" size={15} /></button>
            <button className="nt-icon-btn" title="Zoom out" onClick={() => reactFlow.zoomOut()}><Icon name="zoomOut" size={15} /></button>
            <button className={`nt-icon-btn ${isFullscreen ? "active" : ""}`} title="Fullscreen" onClick={() => setIsFullscreen((v) => !v)}><Icon name="maximize" size={15} /></button>
          </div>
        </div>

        <div className="nt-detail-panel">
          {selectedNode ? (
            <div>
              <div className="row gap-2" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                <div className="nt-detail-title">{selectedNode.label}</div>
                <button className="ad-btn" onClick={() => setSelectedNodeId(null)}><Icon name="close" size={12} /></button>
              </div>
              <div className="nt-detail-subtitle">{selectedNode.type}{selectedNode.role ? ` · ${ROLE_LABEL[selectedNode.role]}` : ""}</div>

              <div className="ad-row-card">
                <div><div className="ad-row-label">Status</div><div className="ad-row-value">{selectedNode.liveStatus ?? "Unknown"}{selectedNode.latencyMs !== null ? ` (${selectedNode.latencyMs}ms)` : ""}</div></div>
              </div>
              <div className="ad-row-card">
                <div><div className="ad-row-label">IP Address</div><div className="ad-row-value">{selectedNode.ipAddress ?? "—"}</div></div>
              </div>
              <div className="ad-row-card">
                <div><div className="ad-row-label">Subnet</div><div className="ad-row-value">{selectedNode.subnet ?? "—"}</div></div>
              </div>
              {selectedNode.vendor && (
                <div className="ad-row-card">
                  <div><div className="ad-row-label">Vendor</div><div className="ad-row-value">{selectedNode.vendor}</div></div>
                </div>
              )}
              {selectedNode.lastSeen && (
                <div className="ad-row-card">
                  <div><div className="ad-row-label">Last Seen</div><div className="ad-row-value">{dayjs(selectedNode.lastSeen).format("DD MMM YYYY, HH:mm")}</div></div>
                </div>
              )}

              <PermissionGate module="network" action="delete">
                <button className="ad-btn ad-btn-danger" style={{ width: "100%", marginTop: 8 }} onClick={() => setConfirmingNodeDelete(true)}>
                  <Icon name="trash" size={12} /> Remove Node
                </button>
              </PermissionGate>
            </div>
          ) : pathTracerActive ? (
            <div className="nt-detail-empty">
              <div className="nt-detail-empty-icon"><Icon name="route" size={40} /></div>
              <div style={{ fontWeight: 700, color: "var(--ad-text)" }}>Path Tracer Active</div>
              <div style={{ fontSize: 12 }}>
                {pathTracerPicks.length === 0 && "Click a source node to begin tracing."}
                {pathTracerPicks.length === 1 && "Now click a destination node."}
                {pathTracerPicks.length === 2 && (tracedPath ? `Path found across ${tracedPath.edgeIds.size} link(s).` : "No path exists between these nodes.")}
              </div>
            </div>
          ) : (
            <div className="nt-detail-empty">
              <div className="nt-detail-empty-icon"><Icon name="network" size={40} /></div>
              <div style={{ fontWeight: 700, color: "var(--ad-text)" }}>Select Topology Node</div>
              <div style={{ fontSize: 12 }}>Click any map switch, gateway, or dynamically discovered node to isolate physical network details.</div>
            </div>
          )}
        </div>
      </div>

      {showAddNode && (
        <AddNodeModal onClose={() => setShowAddNode(false)} onSubmit={(v) => addNodeMutation.mutate(v)} submitting={addNodeMutation.isPending} />
      )}

      {confirmingNodeDelete && selectedNode && (
        <ConfirmDialog
          title="Remove node"
          message={`Are you sure you want to remove "${selectedNode.label}" from the topology map? This cannot be undone.`}
          danger
          loading={deleteNodeMutation.isPending}
          onCancel={() => setConfirmingNodeDelete(false)}
          onConfirm={() => deleteNodeMutation.mutate(selectedNode.id)}
        />
      )}

      {deletingEdgeId !== null && (
        <ConfirmDialog
          title="Remove link"
          message="Are you sure you want to remove this link between nodes? This cannot be undone."
          danger
          loading={deleteEdgeMutation.isPending}
          onCancel={() => setDeletingEdgeId(null)}
          onConfirm={() => deleteEdgeMutation.mutate(deletingEdgeId)}
        />
      )}
    </div>
  );
}

export function TopologyGraphTab() {
  return (
    <ReactFlowProvider>
      <InnerTopologyGraph />
    </ReactFlowProvider>
  );
}

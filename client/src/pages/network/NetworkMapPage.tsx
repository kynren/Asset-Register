import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Background,
  Connection,
  Controls,
  Edge,
  MiniMap,
  Node,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { PermissionGate } from "../../auth/PermissionGate";
import { AddNodeModal, NodeFormValues } from "./AddNodeModal";
import { DevicesTab } from "./DevicesTab";
import { IpRangeScannerTab } from "./IpRangeScannerTab";
import { layoutGraph } from "./layout";

const TYPE_COLOR: Record<string, string> = {
  DEVICE: "#1d4ed8",
  ROUTER: "#7c3aed",
  SWITCH: "#0891b2",
  NVR: "#b45309",
  OTHER: "#667085",
};

interface GraphNode {
  id: number;
  type: string;
  label: string;
  ipAddress: string | null;
  subnet: string | null;
  vendor: string | null;
  deviceType: string | null;
  online: boolean | null;
  lastSeen: string | null;
}

const TABS = [
  { key: "graph", label: "Topology Graph", icon: "network" },
  { key: "scanner", label: "IP Range Scanner", icon: "radar" },
  { key: "clients", label: "App Clients Devices", icon: "grid" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function NetworkMapPage() {
  const [tab, setTab] = useState<TabKey>("graph");
  const [showAddNode, setShowAddNode] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["network-graph"],
    queryFn: async () => (await axiosClient.get("/network/graph")).data as { nodes: GraphNode[]; edges: { id: number; sourceId: number; targetId: number }[] },
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

  const { initialNodes, initialEdges } = useMemo(() => {
    if (!data) return { initialNodes: [], initialEdges: [] };

    const rfNodes: Node[] = data.nodes.map((n) => {
      const borderColor = n.type === "DEVICE" ? (n.online ? "#0f9d58" : "#d92d20") : TYPE_COLOR[n.type];
      const extraLines = [n.ipAddress, n.vendor, n.deviceType].filter(Boolean).join("\n");
      return {
        id: String(n.id),
        position: { x: 0, y: 0 },
        data: { label: `${n.label}${extraLines ? `\n${extraLines}` : ""}` },
        style: {
          border: `2px solid ${borderColor}`,
          borderRadius: 8,
          padding: 8,
          fontSize: 12,
          background: "var(--color-surface)",
          color: "var(--color-text)",
          whiteSpace: "pre-line",
          textAlign: "center",
        },
      };
    });

    const rfEdges: Edge[] = data.edges.map((e) => ({
      id: String(e.id),
      source: String(e.sourceId),
      target: String(e.targetId),
    }));

    return { initialNodes: layoutGraph(rfNodes, rfEdges), initialEdges: rfEdges };
  }, [data]);

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

  const legend = [
    { label: "Device (online)", color: "#0f9d58" },
    { label: "Device (offline)", color: "#d92d20" },
    { label: "Router", color: TYPE_COLOR.ROUTER },
    { label: "Switch", color: TYPE_COLOR.SWITCH },
    { label: "NVR", color: TYPE_COLOR.NVR },
  ];

  return (
    <div className="stack gap-3">
      <div className="page-header">
        <div>
          <h1 className="page-title">Network Topology Map</h1>
          <p className="page-subtitle">Topology graph, active IP scanning, and agent-reported client devices.</p>
        </div>
        {tab === "graph" && (
          <PermissionGate module="network" action="create">
            <button className="btn btn-primary" onClick={() => setShowAddNode(true)}><Icon name="plus" size={14} /> Add Node</button>
          </PermissionGate>
        )}
      </div>

      <div className="row gap-2 flex-wrap">
        {TABS.map((t) => (
          <button key={t.key} className={`btn btn-sm ${tab === t.key ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab(t.key)}>
            <Icon name={t.icon} size={13} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "clients" && <DevicesTab />}
      {tab === "scanner" && <IpRangeScannerTab />}
      {tab === "graph" && (
        <>
          <div className="row gap-3 flex-wrap">
            {legend.map((l) => (
              <div key={l.label} className="row gap-1" style={{ fontSize: 12 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: l.color, display: "inline-block" }} />
                {l.label}
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: 0, height: 560 }}>
            {isLoading ? (
              <div className="row" style={{ justifyContent: "center", padding: 60 }}><div className="spinner" /></div>
            ) : nodes.length === 0 ? (
              <div className="empty-state">
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
                fitView
              >
                <Background />
                <Controls />
                <MiniMap />
              </ReactFlow>
            )}
          </div>
        </>
      )}

      {showAddNode && (
        <AddNodeModal onClose={() => setShowAddNode(false)} onSubmit={(v) => addNodeMutation.mutate(v)} submitting={addNodeMutation.isPending} />
      )}
    </div>
  );
}

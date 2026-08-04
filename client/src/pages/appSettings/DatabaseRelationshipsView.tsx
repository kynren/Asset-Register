import { useMemo, useState } from "react";
import { Background, Edge, MiniMap, Node, ReactFlow, ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { layoutGraph } from "../network/layout";
import { SchemaRegistry } from "./databaseTypes";

const CARDINALITY_COLOR: Record<string, string> = { "one-to-many": "#667085", "one-to-one": "#a855f7" };

function InnerGraph({ registry, onSelectModel }: { registry: SchemaRegistry; onSelectModel: (model: string) => void }) {
  const [filter, setFilter] = useState("");

  const { nodes, edges } = useMemo(() => {
    const rawNodes: Node[] = registry.models.map((m) => ({
      id: m.name,
      position: { x: 0, y: 0 },
      data: { label: `${m.name}\n${m.fields.length} fields` },
      style: {
        padding: 8,
        borderRadius: 8,
        border: m.sensitive ? "1px solid #ef4444" : "1px solid var(--color-border)",
        background: "var(--color-surface)",
        color: "var(--color-text)",
        fontSize: 11,
        whiteSpace: "pre-line",
        textAlign: "center",
        width: 180,
        opacity: filter && !m.name.toLowerCase().includes(filter.toLowerCase()) ? 0.25 : 1,
      },
    }));
    const rawEdges: Edge[] = registry.edges.map((e) => ({
      id: e.id,
      source: e.fromModel,
      target: e.toModel,
      label: e.fkField,
      style: { stroke: CARDINALITY_COLOR[e.cardinality] ?? "#667085" },
      labelStyle: { fontSize: 9, fill: "var(--color-text-muted)" },
    }));
    return { nodes: layoutGraph(rawNodes, rawEdges), edges: rawEdges };
  }, [registry, filter]);

  return (
    <div className="stack gap-2">
      <div className="row gap-2">
        <input className="input" style={{ maxWidth: 280 }} placeholder="Highlight a table..." value={filter} onChange={(e) => setFilter(e.target.value)} />
        <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>
          {registry.models.length} tables · {registry.edges.length} relations — click a table to browse it, drag/scroll to pan/zoom
        </span>
      </div>
      <div style={{ height: 640, border: "1px solid var(--color-border)", borderRadius: 8 }}>
        <ReactFlow nodes={nodes} edges={edges} fitView onNodeClick={(_e, node) => onSelectModel(node.id)} nodesDraggable={false} nodesConnectable={false} edgesFocusable={false}>
          <Background />
          <MiniMap pannable zoomable style={{ background: "var(--color-surface)" }} />
        </ReactFlow>
      </div>
    </div>
  );
}

export function DatabaseRelationshipsView({ registry, onSelectModel }: { registry: SchemaRegistry; onSelectModel: (model: string) => void }) {
  return (
    <ReactFlowProvider>
      <InnerGraph registry={registry} onSelectModel={onSelectModel} />
    </ReactFlowProvider>
  );
}

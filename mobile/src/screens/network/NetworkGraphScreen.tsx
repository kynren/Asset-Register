import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Modal, PanResponder, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { G, Line, Rect, Text as SvgText } from "react-native-svg";
import dagre from "@dagrejs/dagre";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";

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
interface LaidOutNode extends GraphNode {
  x: number;
  y: number;
}

const STATUS_COLOR: Record<string, string> = { ONLINE: "#22c55e", DEGRADED: "#f59e0b", OFFLINE: "#ef4444" };
const ROLE_LABEL: Record<string, string> = {
  CORE_SWITCH: "Core Switch",
  DISTRIBUTION_SWITCH: "Distribution Switch",
  EDGE_SWITCH: "Edge Switch",
  GATEWAY_ROUTER: "Gateway Router",
  HARDWARE_HOST: "Hardware Host",
};
const NODE_TYPES = ["ROUTER", "SWITCH", "NVR", "OTHER"];
const NODE_ROLES: { value: string; label: string }[] = [{ value: "", label: "No specific role" }, ...Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }))];

const NODE_W = 130;
const NODE_H = 46;

function layoutGraph(nodes: GraphNode[], edges: GraphEdge[]): LaidOutNode[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 30, ranksep: 70 });
  nodes.forEach((n) => g.setNode(String(n.id), { width: NODE_W, height: NODE_H }));
  edges.forEach((e) => g.setEdge(String(e.sourceId), String(e.targetId)));
  dagre.layout(g);
  return nodes.map((n) => {
    const pos = g.node(String(n.id));
    return { ...n, x: pos.x, y: pos.y };
  });
}

// Interactive port of client/src/pages/network/TopologyGraphTab.tsx — same dagre layout + backend
// graph, rendered via react-native-svg with a hand-rolled PanResponder for pan/pinch-zoom since
// @xyflow/react is DOM-only. Path Tracer, subnet clustering, latency heatmap, and drag-to-connect
// edges are dropped (touch-first, no native minimap-grade interactions); tap-to-select, status
// filter, search highlight, refresh, add/remove node all carry over.
export function NetworkGraphScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const { width: winW } = useWindowDimensions();
  const containerHeight = 480;

  const [statusFilter, setStatusFilter] = useState<"ALL" | "ONLINE" | "DEGRADED" | "OFFLINE">("ALL");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const transform = useRef({ x: 40, y: containerHeight / 2, scale: 1 });
  const [, forceRender] = useState(0);
  const gesture = useRef({ mode: "none" as "none" | "pan" | "pinch", lastX: 0, lastY: 0, lastDist: 0 });

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["mobile-network-graph"],
    queryFn: async () => (await axiosClient.get("/network/graph")).data as { nodes: GraphNode[]; edges: GraphEdge[] },
  });

  const addNodeMutation = useMutation({
    mutationFn: (values: { type: string; role: string | null; label: string; ipAddress: string }) => axiosClient.post("/network/nodes", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-network-graph"] });
      setShowAdd(false);
    },
  });
  const deleteNodeMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/network/nodes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-network-graph"] });
      setSelectedId(null);
      setConfirmDeleteId(null);
    },
  });

  const allNodes = data?.nodes ?? [];
  const allEdges = data?.edges ?? [];
  const statusCounts = useMemo(() => {
    const counts = { ALL: allNodes.length, ONLINE: 0, DEGRADED: 0, OFFLINE: 0 };
    for (const n of allNodes) if (n.liveStatus) counts[n.liveStatus] += 1;
    return counts;
  }, [allNodes]);

  const visibleNodes = statusFilter === "ALL" ? allNodes : allNodes.filter((n) => n.liveStatus === statusFilter);
  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);
  const visibleEdges = allEdges.filter((e) => visibleIds.has(e.sourceId) && visibleIds.has(e.targetId));

  const matchedIds = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.trim().toLowerCase();
    return new Set(allNodes.filter((n) => n.label.toLowerCase().includes(q) || (n.ipAddress ?? "").includes(q)).map((n) => n.id));
  }, [allNodes, search]);

  const laidOut = useMemo(() => layoutGraph(visibleNodes, visibleEdges), [visibleNodes, visibleEdges]);
  const nodeById = useMemo(() => new Map(laidOut.map((n) => [n.id, n])), [laidOut]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          const dist = Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
          gesture.current = { mode: "pinch", lastX: 0, lastY: 0, lastDist: dist };
        } else {
          gesture.current = { mode: "pan", lastX: evt.nativeEvent.pageX, lastY: evt.nativeEvent.pageY, lastDist: 0 };
        }
      },
      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          const dist = Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
          if (gesture.current.mode !== "pinch" || gesture.current.lastDist === 0) {
            gesture.current = { mode: "pinch", lastX: 0, lastY: 0, lastDist: dist };
            return;
          }
          const ratio = dist / gesture.current.lastDist;
          transform.current.scale = Math.min(2.5, Math.max(0.3, transform.current.scale * ratio));
          gesture.current.lastDist = dist;
          forceRender((v) => v + 1);
        } else if (touches.length === 1) {
          if (gesture.current.mode !== "pan") {
            gesture.current = { mode: "pan", lastX: evt.nativeEvent.pageX, lastY: evt.nativeEvent.pageY, lastDist: 0 };
            return;
          }
          const dx = evt.nativeEvent.pageX - gesture.current.lastX;
          const dy = evt.nativeEvent.pageY - gesture.current.lastY;
          transform.current.x += dx;
          transform.current.y += dy;
          gesture.current.lastX = evt.nativeEvent.pageX;
          gesture.current.lastY = evt.nativeEvent.pageY;
          forceRender((v) => v + 1);
        }
      },
      onPanResponderRelease: () => {
        gesture.current.mode = "none";
      },
    })
  ).current;

  function resetView() {
    transform.current = { x: 40, y: containerHeight / 2, scale: 1 };
    forceRender((v) => v + 1);
  }

  const selectedNode = selectedId ? allNodes.find((n) => n.id === selectedId) ?? null : null;
  const canCreate = hasPermission("network", "create");
  const canDelete = hasPermission("network", "delete");
  const t = transform.current;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm }}>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 12, height: 40 }}>
            <Ionicons name="search" size={15} color={colors.textMuted} />
            <TextInput style={{ flex: 1, marginLeft: 8, color: colors.text, fontSize: 13 }} placeholder="Highlight node..." placeholderTextColor={colors.textMuted} value={search} onChangeText={setSearch} />
          </View>
          <TouchableOpacity style={{ width: 40, height: 40, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }} onPress={() => refetch()}>
            {isFetching ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="refresh" size={17} color={colors.text} />}
          </TouchableOpacity>
          {canCreate && (
            <TouchableOpacity style={{ width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary }} onPress={() => setShowAdd(true)}>
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        <View style={{ flexDirection: "row", gap: 6 }}>
          {(["ALL", "ONLINE", "DEGRADED", "OFFLINE"] as const).map((key) => (
            <TouchableOpacity
              key={key}
              onPress={() => setStatusFilter(key)}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: statusFilter === key ? colors.primary : colors.surface, borderWidth: 1, borderColor: statusFilter === key ? colors.primary : colors.border }}
            >
              {key !== "ALL" && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: STATUS_COLOR[key] }} />}
              <Text style={{ color: statusFilter === key ? "#fff" : colors.text, fontSize: 11.5, fontWeight: "700" }}>{key === "ALL" ? "All" : key.charAt(0) + key.slice(1).toLowerCase()} ({statusCounts[key]})</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : allNodes.length === 0 ? (
        <View style={{ padding: spacing.xl, alignItems: "center" }}>
          <Ionicons name="git-network-outline" size={36} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: 10 }}>
            No devices or nodes yet. Run an agent, discover hosts, or add an infrastructure node manually.
          </Text>
        </View>
      ) : (
        <View
          style={{ height: containerHeight, marginHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden" }}
          {...panResponder.panHandlers}
        >
          <Svg width={winW - spacing.lg * 2} height={containerHeight}>
            <G transform={`translate(${t.x} ${t.y}) scale(${t.scale})`}>
              {visibleEdges.map((e) => {
                const a = nodeById.get(e.sourceId);
                const b = nodeById.get(e.targetId);
                if (!a || !b) return null;
                return <Line key={e.id} x1={a.x + NODE_W / 2} y1={a.y} x2={b.x - NODE_W / 2} y2={b.y} stroke="#34d399" strokeWidth={1.5} />;
              })}
              {laidOut.map((n) => {
                const dimmed = matchedIds && !matchedIds.has(n.id);
                const borderColor = n.liveStatus ? STATUS_COLOR[n.liveStatus] : "#667085";
                const isSelected = selectedId === n.id;
                return (
                  <G key={n.id} onPress={() => setSelectedId(n.id)} opacity={dimmed ? 0.3 : 1}>
                    <Rect
                      x={n.x - NODE_W / 2}
                      y={n.y - NODE_H / 2}
                      width={NODE_W}
                      height={NODE_H}
                      rx={8}
                      fill={colors.surface}
                      stroke={borderColor}
                      strokeWidth={isSelected ? 3 : 2}
                    />
                    <SvgText x={n.x} y={n.y - 3} fontSize={10.5} fontWeight="700" fill={colors.text} textAnchor="middle">
                      {n.label.length > 16 ? `${n.label.slice(0, 15)}…` : n.label}
                    </SvgText>
                    {n.ipAddress && (
                      <SvgText x={n.x} y={n.y + 12} fontSize={9} fill={colors.textMuted} textAnchor="middle">
                        {n.ipAddress}
                      </SvgText>
                    )}
                  </G>
                );
              })}
            </G>
          </Svg>

          <View style={{ position: "absolute", right: 8, bottom: 8, flexDirection: "row", gap: 6 }}>
            <TouchableOpacity style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }} onPress={resetView}>
              <Ionicons name="locate-outline" size={15} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}
              onPress={() => { transform.current.scale = Math.min(2.5, transform.current.scale + 0.2); forceRender((v) => v + 1); }}
            >
              <Ionicons name="add" size={16} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}
              onPress={() => { transform.current.scale = Math.max(0.3, transform.current.scale - 0.2); forceRender((v) => v + 1); }}
            >
              <Ionicons name="remove" size={16} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {selectedNode && (
        <View style={{ margin: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{selectedNode.label}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 2 }}>
                {selectedNode.type}{selectedNode.role ? ` · ${ROLE_LABEL[selectedNode.role] ?? selectedNode.role}` : ""}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setSelectedId(null)}>
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={{ marginTop: spacing.sm, gap: 4 }}>
            <DetailRow label="Status" value={`${selectedNode.liveStatus ?? "Unknown"}${selectedNode.latencyMs !== null ? ` (${selectedNode.latencyMs}ms)` : ""}`} />
            <DetailRow label="IP Address" value={selectedNode.ipAddress ?? "—"} />
            <DetailRow label="Subnet" value={selectedNode.subnet ?? "—"} />
            {selectedNode.vendor && <DetailRow label="Vendor" value={selectedNode.vendor} />}
            {selectedNode.lastSeen && <DetailRow label="Last Seen" value={dayjs(selectedNode.lastSeen).format("DD MMM YYYY, HH:mm")} />}
          </View>

          {canDelete && (
            <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, alignItems: "center", paddingVertical: 10, marginTop: spacing.sm }} onPress={() => setConfirmDeleteId(selectedNode.id)}>
              <Text style={{ color: colors.danger, fontWeight: "700", fontSize: 12.5 }}>Remove Node</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <AddNodeForm colors={colors} spacing={spacing} radius={radius} submitting={addNodeMutation.isPending} onCancel={() => setShowAdd(false)} onSubmit={(v) => addNodeMutation.mutate(v)} />
      </Modal>

      {confirmDeleteId !== null && selectedNode && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setConfirmDeleteId(null)}>
          <View style={{ flex: 1, backgroundColor: "#0008", alignItems: "center", justifyContent: "center", padding: spacing.lg }}>
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, width: "100%", maxWidth: 340 }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>Remove node</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 6 }}>
                Are you sure you want to remove "{selectedNode.label}" from the topology map? This cannot be undone.
              </Text>
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
                <TouchableOpacity style={{ flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }} onPress={() => setConfirmDeleteId(null)}>
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: radius.md, backgroundColor: colors.danger }} disabled={deleteNodeMutation.isPending} onPress={() => deleteNodeMutation.mutate(confirmDeleteId)}>
                  {deleteNodeMutation.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Remove</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ color: colors.textMuted, fontSize: 11.5 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 11.5, fontWeight: "600" }}>{value}</Text>
    </View>
  );
}

function AddNodeForm({
  colors,
  spacing,
  radius,
  submitting,
  onCancel,
  onSubmit,
}: {
  colors: ReturnType<typeof useTheme>["colors"];
  spacing: ReturnType<typeof useTheme>["spacing"];
  radius: ReturnType<typeof useTheme>["radius"];
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (values: { type: string; role: string | null; label: string; ipAddress: string }) => void;
}) {
  const [type, setType] = useState("ROUTER");
  const [role, setRole] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [ipAddress, setIpAddress] = useState("");
  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: colors.text, backgroundColor: colors.bg };

  return (
    <View style={{ flex: 1, backgroundColor: "#0008", justifyContent: "flex-end" }}>
      <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, paddingBottom: spacing.xl }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700", marginBottom: spacing.md }}>Add Infrastructure Node</Text>

        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginBottom: 6 }}>Type</Text>
        <View style={{ flexDirection: "row", gap: 6, marginBottom: spacing.md }}>
          {NODE_TYPES.map((t) => (
            <TouchableOpacity key={t} onPress={() => setType(t)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: type === t ? colors.primary : colors.border, backgroundColor: type === t ? colors.primary + "22" : colors.bg }}>
              <Text style={{ color: type === t ? colors.primary : colors.text, fontSize: 12, fontWeight: "700" }}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginBottom: 6 }}>Role</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: spacing.md }}>
          {NODE_ROLES.map((r) => (
            <TouchableOpacity key={r.value} onPress={() => setRole(r.value || null)} style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.md, borderWidth: 1, borderColor: (role ?? "") === r.value ? colors.primary : colors.border, backgroundColor: (role ?? "") === r.value ? colors.primary + "22" : colors.bg }}>
              <Text style={{ color: (role ?? "") === r.value ? colors.primary : colors.text, fontSize: 11.5, fontWeight: "600" }}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginBottom: 6 }}>Label</Text>
        <TextInput style={[inputStyle, { marginBottom: spacing.md }]} placeholder="e.g. Core Switch — Server Room" placeholderTextColor={colors.textMuted} value={label} onChangeText={setLabel} />

        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginBottom: 6 }}>IP Address</Text>
        <TextInput style={[inputStyle, { marginBottom: spacing.lg }]} placeholder="192.168.1.1" placeholderTextColor={colors.textMuted} autoCapitalize="none" value={ipAddress} onChangeText={setIpAddress} />

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <TouchableOpacity style={{ flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }} onPress={onCancel}>
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.primary, opacity: label.trim() ? 1 : 0.6 }}
            disabled={!label.trim() || submitting}
            onPress={() => {
              onSubmit({ type, role, label: label.trim(), ipAddress: ipAddress.trim() });
              setLabel("");
              setIpAddress("");
            }}
          >
            {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Add Node</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";

interface ConnectedAssetRef {
  id: number;
  assetTag: string;
  name: string;
}

interface Port {
  id: number;
  portNumber: number;
  label: string | null;
  status: "UP" | "DOWN" | "DISABLED";
  vlan: string | null;
  connectedAssetId: number | null;
  connectedAsset: ConnectedAssetRef | null;
  notes: string | null;
}

interface AssetOption {
  id: number;
  assetTag: string;
  name: string;
}

const STATUS_COLOR: Record<Port["status"], string> = {
  UP: "var(--color-success)",
  DOWN: "var(--color-border)",
  DISABLED: "var(--color-danger)",
};

export function SwitchPortsPanel({ asset, onClose }: { asset: { id: number; assetTag: string; name: string }; onClose: () => void }) {
  const [initCount, setInitCount] = useState(24);
  const [editingPortId, setEditingPortId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const queryKey = ["switch-ports", asset.id];

  const { data: ports, isLoading } = useQuery({
    queryKey,
    queryFn: async () => (await axiosClient.get(`/assets/${asset.id}/ports`)).data as Port[],
  });

  const { data: assetOptions } = useQuery({
    queryKey: ["assets-for-port-mapping"],
    queryFn: async () => (await axiosClient.get("/assets", { params: { pageSize: 300 } })).data.items as AssetOption[],
  });

  const initMutation = useMutation({
    mutationFn: (count: number) => axiosClient.post(`/assets/${asset.id}/ports/init`, { count }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const updateMutation = useMutation({
    mutationFn: (params: { portId: number; data: Partial<Port> & { connectedAssetId?: number | null } }) =>
      axiosClient.patch(`/assets/${asset.id}/ports/${params.portId}`, params.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setEditingPortId(null);
    },
  });

  const editingPort = ports?.find((p) => p.id === editingPortId) ?? null;
  const otherAssets = (assetOptions ?? []).filter((a) => a.id !== asset.id);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 860, width: "95%" }} onClick={(e) => e.stopPropagation()}>
        <div className="row gap-2" style={{ justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Port Map — {asset.name}</div>
            <div className="muted" style={{ fontSize: 12 }}>{asset.assetTag}</div>
          </div>
          <button className="modal-close" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>

        {isLoading ? (
          <div className="empty-state">Loading ports...</div>
        ) : !ports || ports.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: 24 }}>
            <p className="muted">No ports mapped for this switch yet.</p>
            <div className="row gap-2" style={{ justifyContent: "center" }}>
              <input
                className="input"
                type="number"
                min={1}
                max={96}
                value={initCount}
                onChange={(e) => setInitCount(Number(e.target.value))}
                style={{ width: 100 }}
              />
              <button className="btn btn-primary" disabled={initMutation.isPending} onClick={() => initMutation.mutate(initCount)}>
                <Icon name="grid" size={13} /> Initialize {initCount} Ports
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="row gap-2 flex-wrap" style={{ marginBottom: 14 }}>
              {["UP", "DOWN", "DISABLED"].map((s) => (
                <span key={s} className="row gap-1" style={{ fontSize: 11, alignItems: "center" }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: STATUS_COLOR[s as Port["status"]], display: "inline-block" }} />
                  {s === "UP" ? "Up / Connected" : s === "DOWN" ? "Down / Unused" : "Administratively Disabled"}
                </span>
              ))}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))",
                gap: 8,
                marginBottom: 16,
              }}
            >
              {ports.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setEditingPortId(p.id)}
                  title={p.label ?? `Port ${p.portNumber}`}
                  style={{
                    border: "1px solid var(--color-border)",
                    borderRadius: 6,
                    padding: "8px 4px",
                    background: "var(--color-surface)",
                    borderTop: `3px solid ${STATUS_COLOR[p.status]}`,
                    cursor: "pointer",
                    textAlign: "center",
                    color: "var(--color-text)",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{p.portNumber}</div>
                  <div className="muted" style={{ fontSize: 9, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.label || p.connectedAsset?.assetTag || "—"}
                  </div>
                </button>
              ))}
            </div>

            <div className="row gap-2">
              <input className="input" type="number" min={1} max={96} value={initCount} onChange={(e) => setInitCount(Number(e.target.value))} style={{ width: 100 }} />
              <button className="btn btn-secondary btn-sm" disabled={initMutation.isPending} onClick={() => initMutation.mutate(initCount)}>
                <Icon name="plus" size={12} /> Add Ports Up To {initCount}
              </button>
            </div>
          </>
        )}

        {editingPort && (
          <PortEditForm
            port={editingPort}
            assetOptions={otherAssets}
            saving={updateMutation.isPending}
            onCancel={() => setEditingPortId(null)}
            onSave={(data) => updateMutation.mutate({ portId: editingPort.id, data })}
          />
        )}
      </div>
    </div>
  );
}

function PortEditForm({
  port,
  assetOptions,
  saving,
  onCancel,
  onSave,
}: {
  port: Port;
  assetOptions: AssetOption[];
  saving: boolean;
  onCancel: () => void;
  onSave: (data: { label: string | null; status: Port["status"]; vlan: string | null; connectedAssetId: number | null; notes: string | null }) => void;
}) {
  const [label, setLabel] = useState(port.label ?? "");
  const [status, setStatus] = useState<Port["status"]>(port.status);
  const [vlan, setVlan] = useState(port.vlan ?? "");
  const [connectedAssetId, setConnectedAssetId] = useState(port.connectedAssetId ? String(port.connectedAssetId) : "");
  const [notes, setNotes] = useState(port.notes ?? "");

  return (
    <div className="modal-overlay" onClick={onCancel} style={{ zIndex: 250 }}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Port {port.portNumber}</div>
        <div className="field">
          <label>Label</label>
          <input className="input" placeholder="e.g. Uplink to Core, Office Rm 4" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="field">
          <label>Status</label>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value as Port["status"])}>
            <option value="UP">Up / Connected</option>
            <option value="DOWN">Down / Unused</option>
            <option value="DISABLED">Administratively Disabled</option>
          </select>
        </div>
        <div className="field">
          <label>VLAN</label>
          <input className="input" placeholder="e.g. 10, 20-Guest" value={vlan} onChange={(e) => setVlan(e.target.value)} />
        </div>
        <div className="field">
          <label>Connected Asset</label>
          <select className="select" value={connectedAssetId} onChange={(e) => setConnectedAssetId(e.target.value)}>
            <option value="">-- None --</option>
            {assetOptions.map((a) => (
              <option key={a.id} value={a.id}>{a.assetTag} — {a.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Notes</label>
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="row gap-2" style={{ justifyContent: "flex-end", marginTop: 8 }}>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={saving}
            onClick={() =>
              onSave({
                label: label || null,
                status,
                vlan: vlan || null,
                connectedAssetId: connectedAssetId ? Number(connectedAssetId) : null,
                notes: notes || null,
              })
            }
          >
            {saving ? "Saving..." : "Save Port"}
          </button>
        </div>
      </div>
    </div>
  );
}

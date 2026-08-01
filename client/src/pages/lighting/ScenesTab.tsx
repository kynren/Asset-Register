import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";
import { Icon } from "../../components/Icon";
import { PermissionGate } from "../../auth/PermissionGate";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Skeleton } from "../../components/Skeleton";
import { LightingDevice } from "./LightingDeviceCard";
import { DeviceActionPicker, DraftAction, actionsToDrafts, draftsToActions } from "./DeviceActionPicker";

interface SceneAction {
  id: number;
  deviceId: number;
  turnOn: boolean;
  brightness: number | null;
  device: { id: number; name: string };
}
interface Scene {
  id: number;
  name: string;
  icon: string | null;
  actions: SceneAction[];
}

const ICON_CHOICES = ["star", "moon", "sun", "bulb", "diamond", "layers", "home", "gauge"];

export function ScenesTab() {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Scene | null>(null);
  const [deleting, setDeleting] = useState<Scene | null>(null);
  const queryClient = useQueryClient();

  const { data: scenes, isLoading } = useQuery({
    queryKey: ["lighting-scenes"],
    queryFn: async () => (await axiosClient.get("/lighting/scenes")).data as Scene[],
  });
  const { data: devices } = useQuery({
    queryKey: ["lighting-devices"],
    queryFn: async () => (await axiosClient.get("/lighting/devices")).data as LightingDevice[],
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["lighting-scenes"] });
  }

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/lighting/scenes/${id}`),
    onSuccess: () => { invalidate(); setDeleting(null); },
  });

  const activateMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`/lighting/scenes/${id}/activate`),
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`/lighting/scenes/${id}/duplicate`),
    onSuccess: invalidate,
  });

  return (
    <div className="stack gap-3">
      <div className="row gap-2" style={{ justifyContent: "flex-end" }}>
        <PermissionGate module="lighting" action="create">
          <button className="btn btn-primary" onClick={() => setShowForm(true)}><Icon name="plus" size={14} /> Add Scene</button>
        </PermissionGate>
      </div>

      {activateMutation.data && (
        <div className={`alert ${activateMutation.data.data.ok ? "alert-success" : "alert-danger"}`}>{activateMutation.data.data.message}</div>
      )}

      {isLoading && <div className="grid grid-cols-3 gap-3"><Skeleton height={140} /><Skeleton height={140} /><Skeleton height={140} /></div>}
      {!isLoading && scenes?.length === 0 && <div className="empty-state card">No scenes yet — bundle a few devices' on/off states into one click.</div>}

      <div className="grid grid-cols-3 gap-3">
        {scenes?.map((scene) => (
          <div key={scene.id} className="card">
            <div className="row gap-2" style={{ alignItems: "center", marginBottom: 8 }}>
              <Icon name={scene.icon ?? "star"} size={20} />
              <strong style={{ fontSize: 14, flex: 1 }}>{scene.name}</strong>
            </div>
            <p className="muted" style={{ fontSize: 12, margin: "0 0 12px" }}>{scene.actions.length} device{scene.actions.length === 1 ? "" : "s"}</p>
            <div className="row gap-2">
              <PermissionGate module="lighting" action="edit">
                <button className="btn btn-primary btn-sm" disabled={activateMutation.isPending} onClick={() => activateMutation.mutate(scene.id)}>
                  <Icon name="power" size={12} /> Activate
                </button>
                <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setEditing(scene)}><Icon name="edit" size={12} /></button>
              </PermissionGate>
              <PermissionGate module="lighting" action="create">
                <button className="btn btn-secondary btn-sm btn-icon" title="Duplicate" onClick={() => duplicateMutation.mutate(scene.id)}><Icon name="paperclip" size={12} /></button>
              </PermissionGate>
              <PermissionGate module="lighting" action="delete">
                <button className="btn btn-danger btn-sm btn-icon" onClick={() => setDeleting(scene)}><Icon name="trash" size={12} /></button>
              </PermissionGate>
            </div>
          </div>
        ))}
      </div>

      {(showForm || editing) && (
        <SceneFormModal scene={editing} devices={devices ?? []} onClose={() => { setShowForm(false); setEditing(null); }} onSaved={invalidate} />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete scene"
          message={`Delete "${deleting.name}"? This cannot be undone.`}
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      )}
    </div>
  );
}

function SceneFormModal({ scene, devices, onClose, onSaved }: { scene: Scene | null; devices: LightingDevice[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(scene?.name ?? "");
  const [icon, setIcon] = useState(scene?.icon ?? "star");
  const [drafts, setDrafts] = useState<Map<number, DraftAction>>(actionsToDrafts(scene?.actions ?? []));

  const mutation = useMutation({
    mutationFn: () => {
      const body = { name, icon, actions: draftsToActions(drafts) };
      return scene ? axiosClient.patch(`/lighting/scenes/${scene.id}`, body) : axiosClient.post("/lighting/scenes", body);
    },
    onSuccess: () => { onSaved(); onClose(); },
  });

  return (
    <FormModal title={scene ? "Edit Scene" : "Add Scene"} onClose={onClose} onSubmit={() => mutation.mutate()} submitting={mutation.isPending} submitDisabled={!name.trim()} maxWidth={560}>
      <div className="grid grid-cols-2">
        <div className="field"><label>Name *</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Movie Night" /></div>
        <div className="field">
          <label>Icon</label>
          <div className="row gap-1 flex-wrap">
            {ICON_CHOICES.map((n) => (
              <button key={n} type="button" className="btn-icon" style={{ border: icon === n ? "2px solid var(--color-primary)" : "1px solid var(--color-border)", borderRadius: 6, width: 32, height: 32 }} onClick={() => setIcon(n)}>
                <Icon name={n} size={14} />
              </button>
            ))}
          </div>
        </div>
      </div>

      <DeviceActionPicker devices={devices} drafts={drafts} onChange={setDrafts} />
    </FormModal>
  );
}

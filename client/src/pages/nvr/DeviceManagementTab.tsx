import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { StatusBadge } from "../../components/StatusBadge";
import { Icon } from "../../components/Icon";
import { FormModal } from "../../components/FormModal";
import { PermissionGate } from "../../auth/PermissionGate";
import { NvrFormModal, NvrFormValues } from "./NvrFormModal";
import { CameraFormModal, CameraFormValues } from "./CameraFormModal";
import { LastKnownConnectionState } from "./TestConnectionButton";
import { PtzControlModal } from "./PtzControlModal";
import { CameraOpsModal } from "./CameraOpsModal";
import { LiveFeedPreview } from "./LiveFeedPreview";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Skeleton } from "../../components/Skeleton";

interface Camera {
  id: number;
  nvrId: number;
  name: string;
  channel: number | null;
  location: { id: number; name: string } | null;
  ipAddress: string | null;
  port: number | null;
  httpPort: number | null;
  username: string | null;
  streamUrl: string | null;
  ptzEnabled: boolean;
  status: string;
  lastCheckedAt: string | null;
  lastConnectionLatencyMs: number | null;
}
interface Nvr {
  id: number;
  name: string;
  ipAddress: string | null;
  port: number | null;
  httpPort: number | null;
  protocol: string | null;
  username: string | null;
  location: { id: number; name: string } | null;
  model: string | null;
  status: string;
  lastCheckedAt: string | null;
  lastConnectionLatencyMs: number | null;
  cameras: Camera[];
}

function toLastKnown(entity: { status: string; lastCheckedAt: string | null; lastConnectionLatencyMs: number | null }): LastKnownConnectionState {
  const status = entity.status === "ONLINE" || entity.status === "OFFLINE" ? entity.status : "UNKNOWN";
  return { status, lastCheckedAt: entity.lastCheckedAt, latencyMs: entity.lastConnectionLatencyMs };
}

export function DeviceManagementTab() {
  const [showNvrForm, setShowNvrForm] = useState(false);
  const [editingNvr, setEditingNvr] = useState<Nvr | null>(null);
  const [cameraNvrId, setCameraNvrId] = useState<number | null>(null);
  const [editingCamera, setEditingCamera] = useState<Camera | null>(null);
  const [liveFeedCamera, setLiveFeedCamera] = useState<Camera | null>(null);
  const [ptzCamera, setPtzCamera] = useState<Camera | null>(null);
  const [opsCamera, setOpsCamera] = useState<Camera | null>(null);
  const [deletingNvr, setDeletingNvr] = useState<Nvr | null>(null);
  const [deletingCamera, setDeletingCamera] = useState<Camera | null>(null);
  const queryClient = useQueryClient();

  const { data: nvrs, isLoading } = useQuery({
    queryKey: ["nvrs"],
    queryFn: async () => (await axiosClient.get("/nvr")).data as Nvr[],
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["nvrs"] });
  }

  const createNvrMutation = useMutation({
    mutationFn: (values: NvrFormValues) => axiosClient.post("/nvr", values),
    onSuccess: () => { invalidate(); setShowNvrForm(false); },
  });

  const updateNvrMutation = useMutation({
    mutationFn: (values: NvrFormValues) => axiosClient.patch(`/nvr/${editingNvr!.id}`, stripBlankPassword(values)),
    onSuccess: () => { invalidate(); setEditingNvr(null); },
  });

  const createCameraMutation = useMutation({
    mutationFn: (values: CameraFormValues & { nvrId: number }) => axiosClient.post(`/nvr/${values.nvrId}/cameras`, values),
    onSuccess: () => { invalidate(); setCameraNvrId(null); },
  });

  const updateCameraMutation = useMutation({
    mutationFn: (values: CameraFormValues) => axiosClient.patch(`/nvr/cameras/${editingCamera!.id}`, stripBlankPassword(values)),
    onSuccess: () => { invalidate(); setEditingCamera(null); },
  });

  const checkNvrMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`/nvr/${id}/check-status`),
    onSuccess: invalidate,
  });

  const checkCameraMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`/nvr/cameras/${id}/check-status`),
    onSuccess: invalidate,
  });

  const deleteNvrMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/nvr/${id}`),
    onSuccess: () => { invalidate(); setDeletingNvr(null); },
  });

  const deleteCameraMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/nvr/cameras/${id}`),
    onSuccess: () => { invalidate(); setDeletingCamera(null); },
  });

  const duplicateNvrMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`/nvr/${id}/duplicate`),
    onSuccess: invalidate,
  });

  const duplicateCameraMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`/nvr/cameras/${id}/duplicate`),
    onSuccess: invalidate,
  });

  function stripBlankPassword<T extends { password: string }>(values: T) {
    const { password, ...rest } = values;
    return password ? values : rest;
  }

  return (
    <div className="stack gap-3">
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <PermissionGate module="nvr" action="create">
          <button className="btn btn-primary" onClick={() => setShowNvrForm(true)}><Icon name="plus" size={14} /> Add NVR</button>
        </PermissionGate>
      </div>

      {isLoading && (
        <div className="stack gap-3">
          <Skeleton height={90} />
          <Skeleton height={90} />
        </div>
      )}
      {!isLoading && nvrs?.length === 0 && <div className="empty-state card">No NVRs registered yet.</div>}

      {nvrs?.map((nvr) => (
        <div key={nvr.id} className="card">
          <div className="row gap-2 flex-wrap" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <div className="row gap-2">
              <Icon name="nvr" size={20} />
              <div>
                <div className="row gap-2">
                  <strong>{nvr.name}</strong>
                  <StatusBadge status={nvr.status} />
                </div>
                <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
                  {nvr.ipAddress ?? "No IP set"}{nvr.port ? `:${nvr.port}` : ""} · {nvr.protocol ?? "—"} · {nvr.location?.name ?? "No location"}
                  {nvr.lastCheckedAt && ` · checked ${dayjs(nvr.lastCheckedAt).format("HH:mm:ss")}`}
                </p>
              </div>
            </div>
            <div className="row gap-2">
              <PermissionGate module="nvr" action="edit">
                <button className="btn btn-secondary btn-sm" disabled={checkNvrMutation.isPending} onClick={() => checkNvrMutation.mutate(nvr.id)}>
                  <Icon name="wifi" size={13} /> Check Status
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditingNvr(nvr)}><Icon name="edit" size={12} /> Edit</button>
              </PermissionGate>
              <PermissionGate module="nvr" action="create">
                <button className="btn btn-secondary btn-sm" onClick={() => setCameraNvrId(nvr.id)}><Icon name="plus" size={12} /> Add Camera</button>
              </PermissionGate>
              <PermissionGate module="nvr" action="duplicate">
                <button className="btn btn-secondary btn-sm btn-icon" title="Duplicate" onClick={() => duplicateNvrMutation.mutate(nvr.id)}><Icon name="paperclip" size={12} /></button>
              </PermissionGate>
              <PermissionGate module="nvr" action="delete">
                <button className="btn btn-danger btn-sm btn-icon" onClick={() => setDeletingNvr(nvr)}><Icon name="trash" size={13} /></button>
              </PermissionGate>
            </div>
          </div>

          {nvr.cameras.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>No cameras added yet.</div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Camera</th><th>Channel</th><th>Location</th><th>IP</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {nvr.cameras.map((cam) => (
                  <tr key={cam.id}>
                    <td>{cam.name}{cam.ptzEnabled && <span className="badge badge-primary" style={{ marginLeft: 6 }}>PTZ</span>}</td>
                    <td>{cam.channel ?? "—"}</td>
                    <td>{cam.location?.name ?? "—"}</td>
                    <td style={{ fontFamily: "monospace" }}>{cam.ipAddress ?? "—"}</td>
                    <td><StatusBadge status={cam.status} /></td>
                    <td>
                      <div className="row gap-1">
                        <PermissionGate module="nvr" action="edit">
                          <button className="btn btn-secondary btn-sm" disabled={checkCameraMutation.isPending} onClick={() => checkCameraMutation.mutate(cam.id)} title="Check status">
                            <Icon name="wifi" size={12} />
                          </button>
                          <button className="btn btn-secondary btn-sm" onClick={() => setLiveFeedCamera(cam)} title="Live feed">
                            <Icon name="camera" size={12} />
                          </button>
                          <button className="btn btn-secondary btn-sm" onClick={() => setEditingCamera(cam)} title="Edit camera">
                            <Icon name="edit" size={12} />
                          </button>
                          <button className="btn btn-secondary btn-sm" onClick={() => setOpsCamera(cam)} title="Recording &amp; motion detection">Ops</button>
                          {cam.ptzEnabled && (
                            <button className="btn btn-secondary btn-sm" onClick={() => setPtzCamera(cam)}>PTZ</button>
                          )}
                        </PermissionGate>
                        <PermissionGate module="nvr" action="duplicate">
                          <button className="btn btn-secondary btn-sm btn-icon" title="Duplicate" onClick={() => duplicateCameraMutation.mutate(cam.id)}>
                            <Icon name="paperclip" size={12} />
                          </button>
                        </PermissionGate>
                        <PermissionGate module="nvr" action="delete">
                          <button className="btn btn-danger btn-sm btn-icon" onClick={() => setDeletingCamera(cam)} title="Delete camera">
                            <Icon name="trash" size={12} />
                          </button>
                        </PermissionGate>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}

      {showNvrForm && (
        <NvrFormModal onClose={() => setShowNvrForm(false)} onSubmit={(v) => createNvrMutation.mutate(v)} submitting={createNvrMutation.isPending} />
      )}
      {editingNvr && (
        <NvrFormModal
          nvrId={editingNvr.id}
          initial={{
            name: editingNvr.name,
            ipAddress: editingNvr.ipAddress ?? "",
            port: editingNvr.port,
            httpPort: editingNvr.httpPort,
            protocol: editingNvr.protocol ?? "RTSP",
            username: editingNvr.username ?? "",
            password: "",
            locationId: editingNvr.location?.id ?? null,
            model: editingNvr.model ?? "",
          }}
          lastKnown={toLastKnown(editingNvr)}
          onClose={() => setEditingNvr(null)}
          onSubmit={(v) => updateNvrMutation.mutate(v)}
          submitting={updateNvrMutation.isPending}
          onCamerasImported={invalidate}
        />
      )}
      {cameraNvrId !== null && (
        <CameraFormModal
          onClose={() => setCameraNvrId(null)}
          onSubmit={(v) => createCameraMutation.mutate({ nvrId: cameraNvrId, ...v })}
          submitting={createCameraMutation.isPending}
        />
      )}
      {editingCamera && (
        <CameraFormModal
          editing
          cameraId={editingCamera.id}
          initial={{
            name: editingCamera.name,
            channel: editingCamera.channel,
            locationId: editingCamera.location?.id ?? null,
            ipAddress: editingCamera.ipAddress ?? "",
            port: editingCamera.port,
            httpPort: editingCamera.httpPort,
            username: editingCamera.username ?? "",
            password: "",
            streamUrl: editingCamera.streamUrl ?? "",
            ptzEnabled: editingCamera.ptzEnabled,
          }}
          lastKnown={toLastKnown(editingCamera)}
          onClose={() => setEditingCamera(null)}
          onSubmit={(v) => updateCameraMutation.mutate(v)}
          submitting={updateCameraMutation.isPending}
        />
      )}
      {liveFeedCamera && (
        <FormModal title={`Live Feed — ${liveFeedCamera.name}`} onClose={() => setLiveFeedCamera(null)} hideFooter maxWidth={620}>
          <LiveFeedPreview streamUrl={liveFeedCamera.streamUrl ?? ""} />
        </FormModal>
      )}
      {ptzCamera && <PtzControlModal cameraId={ptzCamera.id} cameraName={ptzCamera.name} onClose={() => setPtzCamera(null)} />}
      {opsCamera && <CameraOpsModal cameraId={opsCamera.id} cameraName={opsCamera.name} onClose={() => setOpsCamera(null)} />}

      {deletingNvr && (
        <ConfirmDialog
          title="Delete NVR"
          message={`Are you sure you want to delete "${deletingNvr.name}" and all its cameras? This cannot be undone.`}
          danger
          loading={deleteNvrMutation.isPending}
          onCancel={() => setDeletingNvr(null)}
          onConfirm={() => deleteNvrMutation.mutate(deletingNvr.id)}
        />
      )}

      {deletingCamera && (
        <ConfirmDialog
          title="Delete camera"
          message={`Are you sure you want to delete "${deletingCamera.name}"? This cannot be undone.`}
          danger
          loading={deleteCameraMutation.isPending}
          onCancel={() => setDeletingCamera(null)}
          onConfirm={() => deleteCameraMutation.mutate(deletingCamera.id)}
        />
      )}
    </div>
  );
}

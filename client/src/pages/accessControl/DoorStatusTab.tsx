import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { DataTable } from "../../components/DataTable";
import { FormModal } from "../../components/FormModal";
import { Icon } from "../../components/Icon";
import { PermissionGate } from "../../auth/PermissionGate";
import { Skeleton } from "../../components/Skeleton";
import { MatrixTile, MatrixCamera } from "../nvr/MatrixTile";

interface Nvr {
  id: number;
  name: string;
  cameras: MatrixCamera[];
}
interface Door {
  id: number;
  deviceId: number;
  doorNumber: number;
  name: string;
  lockState: "LOCKED" | "UNLOCKED" | "UNKNOWN";
  doorState: "OPEN" | "CLOSED" | "UNKNOWN";
  lastCheckedAt: string | null;
  cameras: MatrixCamera[];
}
interface Device {
  id: number;
  name: string;
  doors: Door[];
}
interface DoorRow extends Door {
  deviceName: string;
}
interface AccessEvent {
  id: number;
  employeeNo: string | null;
  cardNumber: string | null;
  eventType: string;
  message: string | null;
  occurredAt: string;
  device: { id: number; name: string };
  door: { id: number; name: string } | null;
}

type DoorAction = "open" | "close" | "alwaysOpen" | "alwaysClose" | "resume";

const PAGE_SIZE = 14;

const TYPE_TONE: Record<string, string> = {
  REMOTE_OPEN: "badge-primary",
  REMOTE_CLOSE: "badge-neutral",
  REMOTE_CONTROL_ERROR: "badge-danger",
};

export function DoorStatusTab() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [activeDoor, setActiveDoor] = useState<DoorRow | null>(null);
  const [cameraPicker, setCameraPicker] = useState(false);
  const [openPopupCameras, setOpenPopupCameras] = useState<MatrixCamera[] | null>(null);
  const queryClient = useQueryClient();

  const { data: devices, isLoading } = useQuery({
    queryKey: ["access-control-devices"],
    queryFn: async () => (await axiosClient.get("/access-control/devices")).data as Device[],
  });

  const { data: nvrs } = useQuery({
    queryKey: ["nvrs"],
    queryFn: async () => (await axiosClient.get("/nvr")).data as Nvr[],
  });
  const allCameras = useMemo(() => (nvrs ?? []).flatMap((n) => n.cameras), [nvrs]);

  const { data: events } = useQuery({
    queryKey: ["access-events", ""],
    queryFn: async () => (await axiosClient.get("/access-control/events")).data as AccessEvent[],
    refetchInterval: autoUpdate ? 5_000 : false,
  });

  const allDoors: DoorRow[] = useMemo(
    () => (devices ?? []).flatMap((d) => d.doors.map((door) => ({ ...door, deviceName: d.name }))),
    [devices]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allDoors;
    return allDoors.filter((d) => d.name.toLowerCase().includes(q) || d.deviceName.toLowerCase().includes(q));
  }, [allDoors, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const pageDoors = filtered.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["access-control-devices"] });
  }

  const controlMutation = useMutation({
    mutationFn: ({ doorId, action }: { doorId: number; action: DoorAction }) => axiosClient.post(`/access-control/doors/${doorId}/control`, { action }),
  });

  const bulkControlMutation = useMutation({
    mutationFn: async (action: DoorAction) => {
      await Promise.allSettled([...selected].map((doorId) => controlMutation.mutateAsync({ doorId, action })));
    },
    onSuccess: () => { invalidate(); queryClient.invalidateQueries({ queryKey: ["access-events"] }); },
  });

  const singleControlMutation = useMutation({
    mutationFn: (action: DoorAction) => controlMutation.mutateAsync({ doorId: activeDoor!.id, action }),
    onSuccess: (res, action) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["access-events"] });
      const data = res.data as { ok: boolean; cameras?: MatrixCamera[] };
      if (action === "open" && data.ok && data.cameras && data.cameras.length > 0) setOpenPopupCameras(data.cameras);
      setActiveDoor(null);
    },
  });

  const linkCameraMutation = useMutation({
    mutationFn: (cameraId: number) => axiosClient.post(`/access-control/doors/${activeDoor!.id}/cameras`, { cameraId }),
    onSuccess: (res) => {
      invalidate();
      const cameras = (res.data as { cameras: MatrixCamera[] }).cameras;
      setActiveDoor((d) => (d ? { ...d, cameras } : d));
    },
  });

  const unlinkCameraMutation = useMutation({
    mutationFn: (cameraId: number) => axiosClient.delete(`/access-control/doors/${activeDoor!.id}/cameras/${cameraId}`),
    onSuccess: (res) => {
      invalidate();
      const cameras = (res.data as { cameras: MatrixCamera[] }).cameras;
      setActiveDoor((d) => (d ? { ...d, cameras } : d));
    },
  });

  // ISAPI's card-capture endpoint is scoped to the controller, not an individual door/reader —
  // Hikvision doesn't expose a way to target one reader on a multi-door panel, so this reads
  // "whatever card is presented at this door's controller" rather than that specific door's
  // reader in isolation. Blocks for several seconds on the device side until a card is tapped.
  const captureCardMutation = useMutation({
    mutationFn: () => axiosClient.post(`/access-control/devices/${activeDoor!.deviceId}/capture-card`),
  });

  function toggleSelected(id: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((s) => (s.size === pageDoors.length ? new Set() : new Set(pageDoors.map((d) => d.id))));
  }

  function goToPage(n: number) {
    const clamped = Math.min(Math.max(1, n), totalPages);
    setPage(clamped);
    setPageInput(String(clamped));
  }

  const eventColumns: ColumnDef<AccessEvent, any>[] = [
    { header: "Time", accessorFn: (e) => dayjs(e.occurredAt).format("DD MMM, HH:mm:ss") },
    { header: "Device", accessorFn: (e) => e.device.name },
    { header: "Door", accessorFn: (e) => e.door?.name ?? "—" },
    { header: "Type", cell: ({ row }) => <span className={`badge ${TYPE_TONE[row.original.eventType] ?? "badge-neutral"}`}>{row.original.eventType.replace(/_/g, " ")}</span> },
    { header: "Card / Employee", accessorFn: (e) => e.cardNumber ?? e.employeeNo ?? "—" },
  ];

  return (
    <div className="stack gap-3">
      <div className="card">
        <div className="row gap-2 flex-wrap" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div className="row gap-2 flex-wrap" style={{ alignItems: "center" }}>
            <label className="row gap-1" style={{ alignItems: "center", fontSize: 13 }}>
              <input type="checkbox" checked={pageDoors.length > 0 && selected.size === pageDoors.length} onChange={toggleSelectAll} />
              Select All
            </label>
            <PermissionGate module="access-control" action="edit">
              <button className="btn btn-secondary btn-sm" disabled={selected.size === 0 || bulkControlMutation.isPending} onClick={() => bulkControlMutation.mutate("open")}>
                <Icon name="unlock" size={13} /> Unlock
              </button>
              <button className="btn btn-secondary btn-sm" disabled={selected.size === 0 || bulkControlMutation.isPending} onClick={() => bulkControlMutation.mutate("close")}>
                <Icon name="password" size={13} /> Lock
              </button>
              <button className="btn btn-secondary btn-sm" disabled={selected.size === 0 || bulkControlMutation.isPending} onClick={() => bulkControlMutation.mutate("alwaysOpen")}>
                Remain Unlocked
              </button>
              <button className="btn btn-secondary btn-sm" disabled={selected.size === 0 || bulkControlMutation.isPending} onClick={() => bulkControlMutation.mutate("alwaysClose")}>
                Remain Locked
              </button>
            </PermissionGate>
          </div>
          <div className="row gap-2" style={{ alignItems: "center" }}>
            <Icon name="search" size={14} />
            <input
              className="input"
              placeholder="Search doors..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); setPageInput("1"); setSelected(new Set()); }}
              style={{ width: 200 }}
            />
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-4 gap-3">
          <Skeleton height={140} /><Skeleton height={140} /><Skeleton height={140} /><Skeleton height={140} />
        </div>
      )}
      {!isLoading && filtered.length === 0 && (
        <div className="empty-state card">No doors found. Add a device under "Devices & Doors" — doors are detected automatically from the controller.</div>
      )}

      {pageDoors.length > 0 && (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
          {pageDoors.map((door) => {
            const isOpen = door.doorState === "OPEN";
            const isUnlocked = door.lockState === "UNLOCKED";
            return (
              <div key={door.id} className="card" style={{ padding: "10px 12px", cursor: "pointer" }} onClick={() => { captureCardMutation.reset(); setActiveDoor(door); }}>
                <div className="row gap-2" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ position: "relative", width: 44, height: 44 }}>
                    <div
                      className="row"
                      style={{
                        width: 44, height: 44, borderRadius: 8, alignItems: "center", justifyContent: "center",
                        background: isOpen ? "var(--color-warning-soft, #fef3c7)" : "var(--color-surface-muted, #e5e7eb)",
                        color: isOpen ? "var(--color-warning, #b45309)" : "var(--color-text-muted)",
                      }}
                    >
                      <Icon name="door" size={20} />
                    </div>
                    <div
                      className="row"
                      style={{
                        position: "absolute", right: -4, bottom: -4, width: 18, height: 18, borderRadius: "50%",
                        alignItems: "center", justifyContent: "center", border: "2px solid var(--color-surface)",
                        background: isUnlocked ? "var(--color-success, #16a34a)" : "var(--color-text-muted)", color: "#fff",
                      }}
                    >
                      <Icon name={isUnlocked ? "unlock" : "password"} size={9} />
                    </div>
                  </div>
                  <input type="checkbox" checked={selected.has(door.id)} onChange={() => toggleSelected(door.id)} onClick={(e) => e.stopPropagation()} />
                </div>
                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-primary)", margin: "8px 0 6px", lineHeight: 1.3 }} title={`${door.deviceName} — ${door.name}`}>
                  {door.deviceName} {door.name}
                </p>
                <div className="row gap-3" style={{ fontSize: 11 }}>
                  <div className="row gap-1" style={{ alignItems: "center" }}>
                    <Icon name="door" size={12} />
                    <span>{door.doorState === "UNKNOWN" ? "—" : door.doorState === "OPEN" ? "Open" : "Closed"}</span>
                  </div>
                  <div className="row gap-1" style={{ alignItems: "center" }}>
                    <Icon name={isUnlocked ? "unlock" : "password"} size={12} />
                    <span>{door.lockState === "UNKNOWN" ? "—" : door.lockState === "UNLOCKED" ? "Unlocked" : "Locked"}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="row gap-2 flex-wrap" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 12 }}>Total: {filtered.length}</span>
          <div className="row gap-1" style={{ alignItems: "center" }}>
            <button className="btn btn-secondary btn-sm" disabled={clampedPage <= 1} onClick={() => goToPage(1)}>«</button>
            <button className="btn btn-secondary btn-sm" disabled={clampedPage <= 1} onClick={() => goToPage(clampedPage - 1)}>‹</button>
            <input
              className="input"
              style={{ width: 48, textAlign: "center" }}
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value.replace(/[^0-9]/g, ""))}
              onKeyDown={(e) => { if (e.key === "Enter") goToPage(Number(pageInput) || 1); }}
            />
            <span className="muted" style={{ fontSize: 12 }}>/ {totalPages}</span>
            <button className="btn btn-secondary btn-sm" onClick={() => goToPage(Number(pageInput) || 1)}>Go</button>
            <button className="btn btn-secondary btn-sm" disabled={clampedPage >= totalPages} onClick={() => goToPage(clampedPage + 1)}>›</button>
            <button className="btn btn-secondary btn-sm" disabled={clampedPage >= totalPages} onClick={() => goToPage(totalPages)}>»</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="row gap-2" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <strong style={{ fontSize: 13 }}>Real-Time Event</strong>
          <label className="row gap-1" style={{ alignItems: "center", fontSize: 12 }}>
            <input type="checkbox" checked={autoUpdate} onChange={(e) => setAutoUpdate(e.target.checked)} />
            Auto Update Record
          </label>
        </div>
        <DataTable tableId="accessControl.doorEvents" exportModule="access-control" defaultViewMode="list" columns={eventColumns} data={events ?? []} clientPageSize={8} emptyMessage="No recent door events." />
      </div>

      {activeDoor && (
        <FormModal title={`${activeDoor.deviceName} — ${activeDoor.name}`} onClose={() => setActiveDoor(null)} hideFooter>
          <div className="stack gap-2" style={{ fontSize: 12 }}>
            <p className="muted" style={{ margin: 0 }}>
              Door {activeDoor.doorState === "UNKNOWN" ? "—" : activeDoor.doorState === "OPEN" ? "Open" : "Closed"} · Lock {activeDoor.lockState === "UNKNOWN" ? "—" : activeDoor.lockState === "UNLOCKED" ? "Unlocked" : "Locked"}
            </p>
          </div>
          <PermissionGate module="access-control" action="edit">
            <div className="stack gap-2" style={{ marginTop: 12 }}>
              <button className="btn btn-primary" disabled={singleControlMutation.isPending} onClick={() => singleControlMutation.mutate("open")}>
                <Icon name="unlock" size={13} /> Open
              </button>
              <button className="btn btn-secondary" disabled={singleControlMutation.isPending} onClick={() => singleControlMutation.mutate("close")}>
                <Icon name="password" size={13} /> Close
              </button>
              <button className="btn btn-secondary" disabled={singleControlMutation.isPending} onClick={() => singleControlMutation.mutate("alwaysOpen")}>
                Remain Unlocked
              </button>
              <button className="btn btn-secondary" disabled={singleControlMutation.isPending} onClick={() => singleControlMutation.mutate("alwaysClose")}>
                Remain Locked
              </button>
              <button className="btn btn-secondary" disabled={singleControlMutation.isPending} onClick={() => singleControlMutation.mutate("resume")}>
                Resume Schedule
              </button>
              <button className="btn btn-secondary" disabled={captureCardMutation.isPending} onClick={() => captureCardMutation.mutate()}>
                <Icon name="creditCard" size={13} /> {captureCardMutation.isPending ? "Waiting for card tap..." : "Read Card"}
              </button>
              {captureCardMutation.data && (
                <div className={`alert ${(captureCardMutation.data.data as any)?.ok ? "alert-success" : "alert-danger"}`} style={{ margin: 0 }}>
                  {(captureCardMutation.data.data as any)?.ok
                    ? `Card ${(captureCardMutation.data.data as any).cardNo}`
                    : (captureCardMutation.data.data as any)?.message ?? "No card read."}
                </div>
              )}
              {captureCardMutation.isError && (
                <div className="alert alert-danger" style={{ margin: 0 }}>
                  {(captureCardMutation.error as any)?.response?.data?.error ?? "Could not read a card from this door's controller."}
                </div>
              )}
            </div>
          </PermissionGate>

          <div className="stack gap-2" style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--color-border)" }}>
            <div className="row gap-2" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 12 }}>Linked Cameras</strong>
              <PermissionGate module="access-control" action="edit">
                <button className="btn btn-secondary btn-sm" onClick={() => setCameraPicker((v) => !v)}>
                  <Icon name="plus" size={12} /> Add
                </button>
              </PermissionGate>
            </div>
            {activeDoor.cameras.length === 0 && !cameraPicker && (
              <p className="muted" style={{ fontSize: 11, margin: 0 }}>No cameras linked — link one to pop up its live feed whenever this door is remote-opened.</p>
            )}
            {activeDoor.cameras.map((cam) => (
              <div key={cam.id} className="row gap-2" style={{ justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
                <span className="row gap-1" style={{ alignItems: "center" }}><Icon name="camera" size={13} /> {cam.name}</span>
                <PermissionGate module="access-control" action="edit">
                  <button className="btn btn-secondary btn-sm" disabled={unlinkCameraMutation.isPending} onClick={() => unlinkCameraMutation.mutate(cam.id)}>
                    <Icon name="close" size={11} />
                  </button>
                </PermissionGate>
              </div>
            ))}
            {cameraPicker && (
              <div className="row gap-2" style={{ alignItems: "center" }}>
                <select
                  className="input"
                  style={{ flex: 1 }}
                  defaultValue=""
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    if (id) { linkCameraMutation.mutate(id); setCameraPicker(false); }
                  }}
                >
                  <option value="" disabled>Select a camera…</option>
                  {allCameras.filter((c) => !activeDoor.cameras.some((lc) => lc.id === c.id)).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <button className="btn btn-secondary" style={{ marginTop: 12, width: "100%" }} onClick={() => { captureCardMutation.reset(); setCameraPicker(false); setActiveDoor(null); }}>Close</button>
        </FormModal>
      )}

      {openPopupCameras && (
        <FormModal title="Linked Camera Feeds" onClose={() => setOpenPopupCameras(null)} hideFooter>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(2, openPopupCameras.length)}, 1fr)` }}>
            {openPopupCameras.map((cam, i) => (
              <div key={cam.id} style={{ aspectRatio: "16 / 9", position: "relative" }}>
                <MatrixTile slotIndex={i} camera={cam} focused={false} muted onFocus={() => undefined} onClose={() => undefined} registerSnap={() => undefined} />
              </div>
            ))}
          </div>
        </FormModal>
      )}
    </div>
  );
}

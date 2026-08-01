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

interface Door {
  id: number;
  deviceId: number;
  doorNumber: number;
  name: string;
  lockState: "LOCKED" | "UNLOCKED" | "UNKNOWN";
  doorState: "OPEN" | "CLOSED" | "UNKNOWN";
  lastCheckedAt: string | null;
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
  const queryClient = useQueryClient();

  const { data: devices, isLoading } = useQuery({
    queryKey: ["access-control-devices"],
    queryFn: async () => (await axiosClient.get("/access-control/devices")).data as Device[],
  });

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
    onSuccess: () => { invalidate(); queryClient.invalidateQueries({ queryKey: ["access-events"] }); setActiveDoor(null); },
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
        <div className="grid grid-cols-4 gap-3">
          {pageDoors.map((door) => {
            const isOpen = door.doorState === "OPEN";
            const isUnlocked = door.lockState === "UNLOCKED";
            return (
              <div key={door.id} className="card" style={{ padding: 12, cursor: "pointer" }} onClick={() => setActiveDoor(door)}>
                <div className="row gap-2" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <input type="checkbox" checked={selected.has(door.id)} onChange={() => toggleSelected(door.id)} onClick={(e) => e.stopPropagation()} />
                </div>
                <div className="row" style={{ justifyContent: "center", margin: "4px 0 8px" }}>
                  <div style={{ position: "relative", width: 56, height: 56 }}>
                    <div
                      className="row"
                      style={{
                        width: 56, height: 56, borderRadius: 10, alignItems: "center", justifyContent: "center",
                        background: isOpen ? "var(--color-warning-soft, #fef3c7)" : "var(--color-surface-muted, #e5e7eb)",
                        color: isOpen ? "var(--color-warning, #b45309)" : "var(--color-text-muted)",
                      }}
                    >
                      <Icon name="door" size={26} />
                    </div>
                    <div
                      className="row"
                      style={{
                        position: "absolute", right: -4, bottom: -4, width: 22, height: 22, borderRadius: "50%",
                        alignItems: "center", justifyContent: "center", border: "2px solid var(--color-surface)",
                        background: isUnlocked ? "var(--color-success, #16a34a)" : "var(--color-text-muted)", color: "#fff",
                      }}
                    >
                      <Icon name={isUnlocked ? "unlock" : "password"} size={11} />
                    </div>
                  </div>
                </div>
                <p className="row" style={{ justifyContent: "center", textAlign: "center", fontSize: 12, fontWeight: 600, margin: "0 0 6px" }} title={`${door.deviceName} — ${door.name}`}>
                  {door.deviceName} {door.name}
                </p>
                <div className="stack gap-1" style={{ fontSize: 11 }}>
                  <div className="row gap-1" style={{ justifyContent: "center" }}>
                    <Icon name="door" size={12} />
                    <span className="muted">Door</span>
                    <span>{door.doorState === "UNKNOWN" ? "—" : door.doorState === "OPEN" ? "Open" : "Closed"}</span>
                  </div>
                  <div className="row gap-1" style={{ justifyContent: "center" }}>
                    <Icon name={isUnlocked ? "unlock" : "password"} size={12} />
                    <span className="muted">Lock</span>
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
        <DataTable columns={eventColumns} data={events ?? []} clientPageSize={8} emptyMessage="No recent door events." />
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
            </div>
          </PermissionGate>
          <button className="btn btn-secondary" style={{ marginTop: 12, width: "100%" }} onClick={() => setActiveDoor(null)}>Close</button>
        </FormModal>
      )}
    </div>
  );
}

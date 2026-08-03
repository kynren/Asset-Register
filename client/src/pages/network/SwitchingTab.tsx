import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { DataTable } from "../../components/DataTable";
import { PermissionGate } from "../../auth/PermissionGate";
import { AssetFormModal, AssetFormValues } from "../assets/AssetFormModal";
import { SwitchPortsPanel } from "./SwitchPortsPanel";

interface AdoptedSwitch {
  id: number;
  assetTag: string;
  name: string;
  status: string;
  categoryId: number | null;
  locationId: number | null;
  assignedToId: number | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  staticIpAddress: string | null;
  notes: string | null;
  nextServiceDate: string | null;
  gridPowered: boolean;
  remoteManagementEnabled: boolean;
  featuredImageUrl: string | null;
  portCount: number;
}

interface DiscoveredCandidate {
  id: number;
  ipAddress: string;
  hostname: string | null;
  macAddress: string | null;
  vendor: string | null;
  openPorts: number[];
  alreadyAdopted: boolean;
}

interface SwitchingData {
  adopted: AdoptedSwitch[];
  discovered: DiscoveredCandidate[];
  scannedAt: string | null;
}

// "Switching" hosts switches/routers as their own device class within the Network Topology Map —
// modeled loosely after Netgear Insight/Engage: discover candidate gear from the same real
// vendor/port heuristic already used by the IP Range Scanner, adopt a discovered device into
// Asset Inventory with one click, and map its physical ports (label/status/VLAN/what's plugged
// in) once adopted. No fabricated SNMP telemetry — port status is recorded by whoever's mapping
// the switch, same as any other manually-documented physical infrastructure.
export function SwitchingTab() {
  const [adopting, setAdopting] = useState<DiscoveredCandidate | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [editing, setEditing] = useState<AdoptedSwitch | null>(null);
  const [managingPortsFor, setManagingPortsFor] = useState<AdoptedSwitch | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["network-switching"],
    queryFn: async () => (await axiosClient.get("/network/switching")).data as SwitchingData,
  });

  const { data: categories } = useQuery({
    queryKey: ["asset-categories"],
    queryFn: async () => (await axiosClient.get("/asset-categories")).data as { id: number; name: string; isSwitchingDevice: boolean }[],
  });
  const switchingCategory = categories?.find((c) => c.isSwitchingDevice);

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["network-switching"] });
    queryClient.invalidateQueries({ queryKey: ["assets"] });
    queryClient.invalidateQueries({ queryKey: ["asset-stats"] });
  }

  const adoptMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => axiosClient.post("/assets", payload),
    onSuccess: () => { invalidateAll(); setAdopting(null); },
  });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => axiosClient.post("/assets", payload),
    onSuccess: () => { invalidateAll(); setAddingNew(false); },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => axiosClient.patch(`/assets/${editing!.id}`, payload),
    onSuccess: () => { invalidateAll(); setEditing(null); },
  });

  const adoptedColumns: ColumnDef<AdoptedSwitch, any>[] = [
    { header: "Asset Tag", accessorKey: "assetTag" },
    { header: "Name", accessorKey: "name" },
    { header: "Manufacturer / Model", accessorFn: (r) => [r.manufacturer, r.model].filter(Boolean).join(" ") || "—" },
    { header: "IP Address", accessorFn: (r) => r.staticIpAddress ?? "—" },
    { header: "Ports Mapped", accessorFn: (r) => r.portCount },
    {
      header: "",
      id: "actions",
      cell: ({ row }) => (
        <div className="row gap-1">
          <PermissionGate module="network" action="edit">
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing(row.original)}>
              <Icon name="edit" size={12} /> Edit
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setManagingPortsFor(row.original)}>
              <Icon name="grid" size={12} /> Manage Ports
            </button>
          </PermissionGate>
        </div>
      ),
    },
  ];

  const discoveredColumns: ColumnDef<DiscoveredCandidate, any>[] = [
    { header: "IP Address", cell: ({ row }) => <span style={{ fontFamily: "monospace" }}>{row.original.ipAddress}</span> },
    { header: "Hostname", accessorFn: (r) => r.hostname ?? "—" },
    { header: "MAC Address", cell: ({ row }) => <span style={{ fontFamily: "monospace" }}>{row.original.macAddress ?? "—"}</span> },
    { header: "Vendor", accessorFn: (r) => r.vendor ?? "—" },
    { header: "Open Ports", accessorFn: (r) => (r.openPorts.length ? r.openPorts.join(", ") : "—") },
    {
      header: "",
      id: "actions",
      cell: ({ row }) =>
        row.original.alreadyAdopted ? (
          <span className="badge badge-neutral">Already Adopted</span>
        ) : (
          <PermissionGate module="network" action="edit">
            <button className="btn btn-primary btn-sm" onClick={() => setAdopting(row.original)}>
              <Icon name="plus" size={12} /> Adopt into Inventory
            </button>
          </PermissionGate>
        ),
    },
  ];

  return (
    <div className="stack gap-3">
      <div className="card">
        <h3 className="mt-0">Switching Devices</h3>
        <p className="muted" style={{ marginTop: -6 }}>
          Switches and routers on the network — adopt discovered gear into Asset Inventory, then map its physical ports:
          what's connected, VLAN, and status.
        </p>
      </div>

      <div className="card">
        <div className="row gap-2" style={{ justifyContent: "space-between" }}>
          <h3 className="mt-0 mb-0">Adopted Switching Devices</h3>
          <PermissionGate module="network" action="create">
            <button className="btn btn-primary btn-sm" onClick={() => setAddingNew(true)}>
              <Icon name="plus" size={13} /> Add Switching Device
            </button>
          </PermissionGate>
        </div>
        <DataTable
          tableId="network.adoptedSwitches"
          columns={adoptedColumns}
          data={data?.adopted ?? []}
          isLoading={isLoading}
          clientPageSize={10}
          emptyMessage='No switching devices adopted yet. Flag a category as "Switching Device" in Admin & Setup → Asset Categories, or adopt one below.'
        />
      </div>

      <div className="card">
        <div className="row gap-2" style={{ justifyContent: "space-between", marginBottom: 4 }}>
          <h3 className="mt-0 mb-0">Discovered on Network</h3>
          {data?.scannedAt && <span className="muted" style={{ fontSize: 12 }}>From scan completed {dayjs(data.scannedAt).format("DD MMM, HH:mm")}</span>}
        </div>
        <p className="muted" style={{ marginTop: 4 }}>
          Hosts the IP Range Scanner classified as network infrastructure by vendor/open-port signature. Run a scan under
          IP Range Scanner to refresh this list.
        </p>
        <DataTable
          tableId="network.discoveredSwitches"
          defaultViewMode="list"
          columns={discoveredColumns}
          data={data?.discovered ?? []}
          isLoading={isLoading}
          clientPageSize={10}
          emptyMessage="No candidate switching devices found in the most recent scan."
        />
      </div>

      {adopting && (
        <AssetFormModal
          title={`Adopt "${adopting.hostname || adopting.ipAddress}" as a Switching Device`}
          initial={{
            assetTag: adopting.macAddress ? adopting.macAddress.replace(/:/g, "").toUpperCase() : adopting.ipAddress.replace(/\./g, "-"),
            name: adopting.hostname || adopting.ipAddress,
            manufacturer: adopting.vendor ?? "",
            categoryId: switchingCategory?.id ?? null,
            notes: "Discovered via IP Range Scanner network infrastructure heuristic.",
          }}
          onClose={() => setAdopting(null)}
          submitting={adoptMutation.isPending}
          onSubmit={(values: AssetFormValues) => {
            adoptMutation.mutate({
              ...values,
              nextServiceDate: values.nextServiceDate ? new Date(values.nextServiceDate).toISOString() : null,
              staticIpAddress: adopting.ipAddress,
            });
          }}
        />
      )}

      {addingNew && (
        <AssetFormModal
          title="Add Switching Device"
          initial={{ categoryId: switchingCategory?.id ?? null }}
          onClose={() => setAddingNew(false)}
          submitting={createMutation.isPending}
          onSubmit={(values: AssetFormValues) => {
            createMutation.mutate({
              ...values,
              nextServiceDate: values.nextServiceDate ? new Date(values.nextServiceDate).toISOString() : null,
            });
          }}
        />
      )}

      {editing && (
        <AssetFormModal
          assetId={editing.id}
          title={`Edit "${editing.name}"`}
          featuredImageUrl={editing.featuredImageUrl}
          initial={{
            assetTag: editing.assetTag,
            name: editing.name,
            status: editing.status,
            categoryId: editing.categoryId,
            locationId: editing.locationId,
            assignedToId: editing.assignedToId,
            manufacturer: editing.manufacturer ?? "",
            model: editing.model ?? "",
            serialNumber: editing.serialNumber ?? "",
            notes: editing.notes ?? "",
            nextServiceDate: editing.nextServiceDate ? editing.nextServiceDate.slice(0, 10) : "",
            gridPowered: editing.gridPowered,
            remoteManagementEnabled: editing.remoteManagementEnabled,
          }}
          onClose={() => setEditing(null)}
          submitting={updateMutation.isPending}
          onSubmit={(values: AssetFormValues) => {
            updateMutation.mutate({
              ...values,
              nextServiceDate: values.nextServiceDate ? new Date(values.nextServiceDate).toISOString() : null,
            });
          }}
        />
      )}

      {managingPortsFor && (
        <SwitchPortsPanel
          asset={{ id: managingPortsFor.id, assetTag: managingPortsFor.assetTag, name: managingPortsFor.name }}
          onClose={() => setManagingPortsFor(null)}
        />
      )}
    </div>
  );
}

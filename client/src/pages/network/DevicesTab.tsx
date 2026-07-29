import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { DataTable } from "../../components/DataTable";
import { FilterBar } from "../../components/FilterBar";
import { PermissionGate } from "../../auth/PermissionGate";
import { DeviceLinkModal } from "./DeviceLinkModal";

interface Device {
  id: number;
  hostname: string;
  macAddress: string;
  ipAddresses: string[];
  os: string | null;
  osVersion: string | null;
  lastSeen: string;
  asset: { id: number; assetTag: string } | null;
}

export function DevicesTab() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [linking, setLinking] = useState<Device | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["devices", { search, page }],
    queryFn: async () => (await axiosClient.get("/devices", { params: { search: search || undefined, page, pageSize: 15 } })).data,
  });

  const columns: ColumnDef<Device, any>[] = [
    { header: "Hostname", accessorKey: "hostname" },
    { header: "MAC Address", accessorKey: "macAddress" },
    { header: "IP Address(es)", accessorFn: (r) => r.ipAddresses.join(", ") || "—" },
    { header: "OS", accessorFn: (r) => `${r.os ?? "—"} ${r.osVersion ?? ""}`.trim() },
    { header: "Last Seen", accessorFn: (r) => dayjs(r.lastSeen).format("DD MMM, HH:mm") },
    { header: "Linked Asset", accessorFn: (r) => r.asset?.assetTag ?? "Unlinked" },
    {
      header: "",
      id: "actions",
      cell: ({ row }) =>
        !row.original.asset && (
          <PermissionGate module="network" action="edit">
            <button className="btn btn-secondary btn-sm" onClick={() => setLinking(row.original)}>Link to Asset</button>
          </PermissionGate>
        ),
    },
  ];

  return (
    <div>
      <FilterBar search={search} onSearchChange={(v) => { setSearch(v); setPage(1); }} searchPlaceholder="Search by hostname or MAC..." />
      <div className="card">
        <DataTable
          columns={columns}
          data={data?.items ?? []}
          isLoading={isLoading}
          page={data?.page}
          totalPages={data?.totalPages}
          onPageChange={setPage}
          emptyMessage="No devices reported yet. Run the Kynren agent on a client machine to populate this list."
        />
      </div>
      {linking && <DeviceLinkModal device={linking} onClose={() => setLinking(null)} />}
    </div>
  );
}

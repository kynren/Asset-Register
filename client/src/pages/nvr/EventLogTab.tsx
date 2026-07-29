import { useQuery } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { DataTable } from "../../components/DataTable";

interface CameraEvent {
  id: number;
  type: string;
  message: string | null;
  createdAt: string;
  camera: { name: string } | null;
  nvr: { name: string } | null;
}

const TYPE_TONE: Record<string, string> = {
  ONLINE: "badge-success",
  OFFLINE: "badge-danger",
  MOTION: "badge-warning",
  PTZ_COMMAND: "badge-primary",
};

export function EventLogTab() {
  const { data: events, isLoading } = useQuery({
    queryKey: ["camera-events"],
    queryFn: async () => (await axiosClient.get("/nvr/events")).data as CameraEvent[],
    refetchInterval: 15_000,
  });

  const columns: ColumnDef<CameraEvent, any>[] = [
    { header: "Time", accessorFn: (e) => dayjs(e.createdAt).format("DD MMM YYYY, HH:mm:ss") },
    { header: "Source", accessorFn: (e) => e.camera?.name ?? e.nvr?.name ?? "—" },
    { header: "Type", cell: ({ row }) => <span className={`badge ${TYPE_TONE[row.original.type] ?? "badge-neutral"}`}>{row.original.type.replace("_", " ")}</span> },
    { header: "Message", accessorFn: (e) => e.message ?? "—" },
  ];

  return (
    <div className="card">
      <DataTable columns={columns} data={events ?? []} isLoading={isLoading} clientPageSize={10} emptyMessage="No events recorded yet." />
    </div>
  );
}

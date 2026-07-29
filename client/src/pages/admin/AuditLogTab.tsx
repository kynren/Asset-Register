import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { DataTable } from "../../components/DataTable";
import { ColumnDef } from "@tanstack/react-table";

interface AuditRow {
  id: number;
  action: string;
  entityType: string | null;
  entityId: number | null;
  createdAt: string;
  user: { firstName: string; lastName: string; email: string } | null;
}

export function AuditLogTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["audit-log", page],
    queryFn: async () => (await axiosClient.get("/audit", { params: { page, pageSize: 20 } })).data,
  });

  const columns: ColumnDef<AuditRow, any>[] = [
    { header: "Date", accessorFn: (r) => dayjs(r.createdAt).format("DD MMM YYYY, HH:mm") },
    { header: "User", accessorFn: (r) => (r.user ? `${r.user.firstName} ${r.user.lastName}` : "System") },
    { header: "Action", accessorKey: "action" },
    { header: "Entity", accessorFn: (r) => (r.entityType ? `${r.entityType} #${r.entityId}` : "—") },
  ];

  return (
    <div className="card">
      <DataTable columns={columns} data={data?.items ?? []} isLoading={isLoading} page={data?.page} totalPages={data?.totalPages} onPageChange={setPage} />
    </div>
  );
}

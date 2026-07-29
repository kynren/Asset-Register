import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { DataTable } from "../../components/DataTable";

interface ListItem {
  id: number;
  name: string;
  address?: string;
}

function SimpleListManager({ title, url, queryKey, extraField }: { title: string; url: string; queryKey: string; extraField?: string }) {
  const [name, setName] = useState("");
  const [extra, setExtra] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: [queryKey], queryFn: async () => (await axiosClient.get(url)).data as ListItem[] });

  const createMutation = useMutation({
    mutationFn: () => axiosClient.post(url, extraField ? { name, [extraField]: extra } : { name }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [queryKey] }); setName(""); setExtra(""); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`${url}/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [queryKey] }),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate();
  }

  const columns: ColumnDef<ListItem, any>[] = [
    { header: "Name", accessorFn: (r) => r.name + (r.address ? ` — ${r.address}` : "") },
    {
      header: "",
      id: "actions",
      cell: ({ row }) => (
        <button className="btn btn-danger btn-sm btn-icon" onClick={() => deleteMutation.mutate(row.original.id)}>
          <Icon name="trash" size={13} />
        </button>
      ),
    },
  ];

  return (
    <div className="card">
      <h3 className="mt-0">{title}</h3>
      <form className="row gap-2" onSubmit={handleSubmit} style={{ marginBottom: 14 }}>
        <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        {extraField && <input className="input" placeholder={extraField} value={extra} onChange={(e) => setExtra(e.target.value)} />}
        <button className="btn btn-primary btn-sm" type="submit" disabled={createMutation.isPending}><Icon name="plus" size={13} /> Add</button>
      </form>
      <DataTable columns={columns} data={data ?? []} isLoading={isLoading} clientPageSize={5} emptyMessage="None added yet." />
    </div>
  );
}

export function CategoriesLocationsTab() {
  return (
    <div className="grid grid-cols-2">
      <SimpleListManager title="Asset Categories" url="/asset-categories" queryKey="asset-categories" />
      <SimpleListManager title="Locations" url="/locations" queryKey="locations" extraField="address" />
      <SimpleListManager title="Ticket Categories" url="/ticket-categories" queryKey="ticket-categories" />
    </div>
  );
}

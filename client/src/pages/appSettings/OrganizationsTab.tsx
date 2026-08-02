import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { DataTable } from "../../components/DataTable";
import { FormModal } from "../../components/FormModal";
import { Icon } from "../../components/Icon";
import { PasswordInput } from "../../components/PasswordInput";
import { PermissionGate } from "../../auth/PermissionGate";

interface OrganizationRow {
  id: number;
  name: string;
  schemaName: string;
  createdAt: string;
}

export function OrganizationsTab() {
  const [showCreate, setShowCreate] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["app-settings-organizations"],
    queryFn: async () => (await axiosClient.get("/app-settings/organizations")).data as OrganizationRow[],
  });

  const columns: ColumnDef<OrganizationRow, any>[] = [
    { header: "Organization", accessorKey: "name" },
    { header: "Schema", cell: ({ row }) => <span style={{ fontFamily: "monospace", fontSize: 12 }}>{row.original.schemaName}</span> },
    { header: "Created", accessorFn: (r) => dayjs(r.createdAt).format("DD MMM YYYY") },
  ];

  return (
    <div className="stack gap-3">
      <div className="row gap-2" style={{ justifyContent: "space-between" }}>
        <p className="muted" style={{ margin: 0, maxWidth: 560 }}>
          Every organization gets its own isolated database schema. Creating one here provisions that schema and its
          first Super Admin user — they run their own organization end to end, but can't create further organizations
          or reach App Settings themselves.
        </p>
        <PermissionGate module="app-settings" action="create">
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
            <Icon name="plus" size={13} /> Create Organization
          </button>
        </PermissionGate>
      </div>

      <div className="card">
        <DataTable columns={columns} data={data ?? []} isLoading={isLoading} emptyMessage="No organizations yet." />
      </div>

      {showCreate && (
        <CreateOrganizationModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            queryClient.invalidateQueries({ queryKey: ["app-settings-organizations"] });
          }}
        />
      )}
    </div>
  );
}

function CreateOrganizationModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [organizationName, setOrganizationName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const mutation = useMutation({
    mutationFn: () => axiosClient.post("/app-settings/organizations", { organizationName, firstName, lastName, email, password }),
    onSuccess: () => onCreated(),
  });

  const canSubmit = organizationName.trim() && firstName.trim() && lastName.trim() && email.trim() && password.length >= 8;

  return (
    <FormModal title="Create Organization" onClose={onClose} onSubmit={() => mutation.mutate()} submitting={mutation.isPending} submitDisabled={!canSubmit}>
      {mutation.isError && <div className="alert alert-danger">{(mutation.error as any)?.response?.data?.error ?? "Could not create this organization."}</div>}

      <div className="field"><label>Organization Name *</label><input className="input" value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} /></div>

      <div className="grid grid-cols-2">
        <div className="field"><label>Admin First Name *</label><input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
        <div className="field"><label>Admin Last Name *</label><input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
      </div>

      <div className="field"><label>Admin Email *</label><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div className="field"><label>Admin Password *</label><PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} /></div>
      <p className="muted" style={{ fontSize: 12 }}>This user is created as that organization's Super Admin and can log in immediately.</p>
    </FormModal>
  );
}

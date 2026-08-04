import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import { useNavigate } from "react-router-dom";
import { axiosClient } from "../../api/axiosClient";
import { DataTable } from "../../components/DataTable";
import { FilterBar } from "../../components/FilterBar";
import { StatusBadge } from "../../components/StatusBadge";
import { Icon } from "../../components/Icon";
import { FormModal } from "../../components/FormModal";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { QrCodeModal } from "../../components/QrCodeModal";
import { PermissionGate } from "../../auth/PermissionGate";
import { ChipSelect } from "../../components/ChipSelect";

interface UserRow {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  role: { id: number; name: string };
}

export function UsersTab() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [deactivating, setDeactivating] = useState<UserRow | null>(null);
  const [tempPasswordInfo, setTempPasswordInfo] = useState<{ email: string; password: string } | null>(null);
  const [qrUser, setQrUser] = useState<UserRow | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: roles } = useQuery({ queryKey: ["roles-lite"], queryFn: async () => (await axiosClient.get("/roles")).data });
  const { data, isLoading } = useQuery({
    queryKey: ["users", { search, page }],
    queryFn: async () => (await axiosClient.get("/users", { params: { search: search || undefined, page, pageSize: 15 } })).data,
  });

  const createMutation = useMutation({
    mutationFn: (values: { email: string; firstName: string; lastName: string; roleId: number }) => axiosClient.post("/users", values),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setShowCreate(false);
      setTempPasswordInfo({ email: res.data.user.email, password: res.data.tempPassword });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: () => axiosClient.delete(`/users/${deactivating!.id}`),
    meta: { successMessage: "User deactivated" },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["users"] }); setDeactivating(null); },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (userId: number) => axiosClient.post(`/users/${userId}/reset-password`, {}).then((res) => res.data.tempPassword as string),
    onSuccess: (newPassword, userId) => {
      const u = data?.items?.find((x: UserRow) => x.id === userId);
      setTempPasswordInfo({ email: u?.email ?? "", password: newPassword });
    },
  });

  const columns: ColumnDef<UserRow, any>[] = [
    { header: "Name", accessorFn: (r) => `${r.firstName} ${r.lastName}` },
    { header: "Email", accessorKey: "email" },
    { header: "Role", accessorFn: (r) => r.role.name },
    { header: "Status", accessorFn: (r) => (r.isActive ? "ACTIVE" : "INACTIVE"), cell: (info) => <StatusBadge status={info.getValue()} /> },
    {
      header: "",
      id: "actions",
      cell: ({ row }) => (
        <div className="row gap-1" onClick={(e) => e.stopPropagation()}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/admin/users/${row.original.id}`)}>View Profile</button>
          <PermissionGate module="admin" action="edit">
            <button className="btn btn-secondary btn-sm" onClick={() => resetPasswordMutation.mutate(row.original.id)}>Reset Password</button>
          </PermissionGate>
          <button className="btn btn-secondary btn-sm btn-icon" title="Print QR label" onClick={() => setQrUser(row.original)}><Icon name="grid" size={12} /></button>
          {row.original.isActive && (
            <PermissionGate module="admin" action="delete">
              <button className="btn btn-danger btn-sm" onClick={() => setDeactivating(row.original)}>Deactivate</button>
            </PermissionGate>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <FilterBar
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="Search users..."
        actions={<button className="btn btn-primary" onClick={() => setShowCreate(true)}><Icon name="plus" size={14} /> Add User</button>}
      />
      <div className="card">
        <DataTable
          tableId="admin.users"
          exportModule="admin"
          columns={columns}
          data={data?.items ?? []}
          isLoading={isLoading}
          page={data?.page}
          totalPages={data?.totalPages}
          onPageChange={setPage}
          onRowClick={(row) => navigate(`/admin/users/${row.id}`)}
        />
      </div>

      {showCreate && (
        <CreateUserModal roles={roles ?? []} onClose={() => setShowCreate(false)} onSubmit={(v) => createMutation.mutate(v)} submitting={createMutation.isPending} />
      )}

      {deactivating && (
        <ConfirmDialog
          title="Deactivate user"
          message={`Deactivate ${deactivating.firstName} ${deactivating.lastName}? They will no longer be able to log in.`}
          danger
          loading={deactivateMutation.isPending}
          onCancel={() => setDeactivating(null)}
          onConfirm={() => deactivateMutation.mutate()}
        />
      )}

      {tempPasswordInfo && (
        <FormModal title="Temporary Password" onClose={() => setTempPasswordInfo(null)} hideFooter>
          <p>Share this temporary password with <strong>{tempPasswordInfo.email}</strong> securely. They will be required to change it on first login.</p>
          <div className="card" style={{ fontFamily: "monospace", fontSize: 16, textAlign: "center", background: "var(--color-bg)" }}>
            {tempPasswordInfo.password}
          </div>
          <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => setTempPasswordInfo(null)}>Done</button>
        </FormModal>
      )}

      {qrUser && (
        <QrCodeModal
          title="User QR Code"
          value={`${window.location.origin}/admin/users/${qrUser.id}`}
          label={`${qrUser.firstName} ${qrUser.lastName}`}
          subLabel={qrUser.email}
          onClose={() => setQrUser(null)}
        />
      )}
    </div>
  );
}

function CreateUserModal({ roles, onClose, onSubmit, submitting }: { roles: any[]; onClose: () => void; onSubmit: (v: any) => void; submitting?: boolean }) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [roleId, setRoleId] = useState<number | "">(roles[0]?.id ?? "");

  return (
    <FormModal title="Add User" onClose={onClose} onSubmit={() => onSubmit({ email, firstName, lastName, roleId: Number(roleId) })} submitting={submitting}>
      <div className="grid grid-cols-2">
        <div className="field"><label>First Name *</label><input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} required /></div>
        <div className="field"><label>Last Name *</label><input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} required /></div>
      </div>
      <div className="field"><label>Email *</label><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
      <div className="field">
        <label>Role</label>
        <ChipSelect
          value={roleId !== "" ? String(roleId) : ""}
          onChange={(v) => setRoleId(Number(v))}
          options={roles.map((r) => ({ value: String(r.id), label: r.name }))}
        />
      </div>
      <p className="muted" style={{ fontSize: 12 }}>A temporary password will be generated automatically.</p>
    </FormModal>
  );
}

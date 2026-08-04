import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { DataTable } from "../../components/DataTable";
import { FormModal } from "../../components/FormModal";
import { Icon } from "../../components/Icon";
import { PasswordInput } from "../../components/PasswordInput";
import { PermissionGate } from "../../auth/PermissionGate";
import { useAuth } from "../../auth/AuthContext";
import { OrganizationLogoCard } from "./OrganizationLogoCard";
import { OrgSwitchConfirmModal } from "./OrgSwitchConfirmModal";

interface OrganizationRow {
  id: number;
  name: string;
  schemaName: string;
  createdAt: string;
  logoUrl: string | null;
}

export function OrganizationsTab({ strictActiveDisable }: { strictActiveDisable?: boolean }) {
  const [showCreate, setShowCreate] = useState(false);
  const [editingOrg, setEditingOrg] = useState<OrganizationRow | null>(null);
  const [pendingSwitchOrg, setPendingSwitchOrg] = useState<OrganizationRow | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { organization, switchOrganization } = useAuth();
  const [switchingId, setSwitchingId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["app-settings-organizations"],
    queryFn: async () => (await axiosClient.get("/app-settings/organizations")).data as OrganizationRow[],
  });

  async function confirmSwitch(credential: { password: string } | { pin: string }, rememberMinutes: number | null) {
    if (!pendingSwitchOrg) return;
    setSwitchingId(pendingSwitchOrg.id);
    setSwitchError(null);
    try {
      await switchOrganization(pendingSwitchOrg.id, credential, rememberMinutes);
      setPendingSwitchOrg(null);
    } catch (err: any) {
      setSwitchError(err.response?.data?.error ?? "Could not verify your credential.");
    } finally {
      setSwitchingId(null);
    }
  }

  const columns: ColumnDef<OrganizationRow, any>[] = [
    { header: "Organization", accessorKey: "name" },
    { header: "Schema", cell: ({ row }) => <span style={{ fontFamily: "monospace", fontSize: 12 }}>{row.original.schemaName}</span> },
    { header: "Created", accessorFn: (r) => dayjs(r.createdAt).format("DD MMM YYYY") },
    {
      header: "",
      id: "actions",
      cell: ({ row }) => {
        const isActive = row.original.id === organization?.id;
        return (
          <div className="row gap-1">
            <button
              className="btn btn-secondary btn-sm btn-icon"
              title={isActive ? "Currently managing this organization" : "Manage this organization"}
              disabled={(strictActiveDisable ? isActive : false) || switchingId !== null}
              onClick={() => setPendingSwitchOrg(row.original)}
            >
              <Icon name={isActive ? "check" : "arrowRight"} size={12} />
            </button>
            <PermissionGate module="app-settings" action="edit">
              <button className="btn btn-secondary btn-sm btn-icon" title="Edit organization" onClick={() => setEditingOrg(row.original)}>
                <Icon name="edit" size={12} />
              </button>
            </PermissionGate>
          </div>
        );
      },
    },
  ];

  return (
    <div className="stack gap-3">
      <div className="row gap-2" style={{ justifyContent: "space-between" }}>
        <p className="muted" style={{ margin: 0, maxWidth: 560 }}>
          Every organization gets its own isolated database schema. Creating one here provisions that schema and its
          first Super Admin user — they run their own organization end to end, but can't create further organizations
          or reach App Settings themselves. Use the arrow icon to select an organization to manage here.
        </p>
        <PermissionGate module="app-settings" action="create">
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
            <Icon name="plus" size={13} /> Create Organization
          </button>
        </PermissionGate>
      </div>

      <div className="card">
        <DataTable
          tableId="appSettings.organizations"
          exportModule="app-settings"
          columns={columns}
          data={data ?? []}
          isLoading={isLoading}
          emptyMessage="No organizations yet."
          renderCard={(org) => (
            <OrganizationLogoCard
              organization={org}
              isActive={org.id === organization?.id}
              disabled={(strictActiveDisable ? org.id === organization?.id : false) || switchingId !== null}
              onSwitch={() => setPendingSwitchOrg(org)}
              onEdit={() => setEditingOrg(org)}
            />
          )}
        />
      </div>

      {pendingSwitchOrg && (
        <OrgSwitchConfirmModal
          organizationName={pendingSwitchOrg.name}
          submitting={switchingId !== null}
          error={switchError}
          onCancel={() => { setPendingSwitchOrg(null); setSwitchError(null); }}
          onConfirm={confirmSwitch}
        />
      )}

      {showCreate && (
        <CreateOrganizationModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            queryClient.invalidateQueries({ queryKey: ["app-settings-organizations"] });
          }}
        />
      )}

      {editingOrg && (
        <EditOrganizationModal
          organization={editingOrg}
          onClose={() => setEditingOrg(null)}
          onSaved={() => {
            setEditingOrg(null);
            queryClient.invalidateQueries({ queryKey: ["app-settings-organizations"] });
          }}
        />
      )}
    </div>
  );
}

function EditOrganizationModal({ organization, onClose, onSaved }: { organization: OrganizationRow; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(organization.name);
  const [schemaName, setSchemaName] = useState(organization.schemaName);
  const [logoUrl, setLogoUrl] = useState(organization.logoUrl);
  const isDefaultOrg = organization.schemaName === "public";
  const logoInputRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: () => axiosClient.patch(`/app-settings/organizations/${organization.id}`, { name, schemaName }),
    onSuccess: () => onSaved(),
  });

  const logoMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return axiosClient.post(`/app-settings/organizations/${organization.id}/logo`, formData, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: (res) => setLogoUrl(res.data.logoUrl),
  });

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) logoMutation.mutate(file);
    if (logoInputRef.current) logoInputRef.current.value = "";
  }

  const canSubmit = name.trim() && schemaName.trim();

  return (
    <FormModal title="Edit Organization" onClose={onClose} onSubmit={() => mutation.mutate()} submitting={mutation.isPending} submitDisabled={!canSubmit}>
      {mutation.isError && <div className="alert alert-danger">{(mutation.error as any)?.response?.data?.error ?? "Could not save this organization."}</div>}

      <div className="field">
        <label>Logo</label>
        <div className="row gap-3" style={{ alignItems: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: 8, background: "var(--color-bg)", border: "1px solid var(--color-border)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {logoUrl ? <img src={logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon name="briefcase" size={18} />}
          </div>
          <button type="button" className="btn btn-secondary btn-sm" disabled={logoMutation.isPending} onClick={() => logoInputRef.current?.click()}>
            {logoMutation.isPending ? "Uploading..." : "Upload Logo"}
          </button>
          <input ref={logoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleLogoChange} />
        </div>
      </div>

      <div className="field"><label>Organization Name *</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>

      <div className="field">
        <label>Schema Name {isDefaultOrg ? <span className="muted">(the default organization's schema cannot be renamed)</span> : "*"}</label>
        <input
          className="input"
          style={{ fontFamily: "monospace" }}
          value={schemaName}
          onChange={(e) => setSchemaName(e.target.value.toLowerCase())}
          disabled={isDefaultOrg}
        />
      </div>
      {!isDefaultOrg && schemaName !== organization.schemaName && (
        <p className="muted" style={{ fontSize: 12 }}>
          This physically renames the database schema. Any session currently viewing this organization will need to switch back into it again.
        </p>
      )}
      <p className="muted" style={{ fontSize: 12 }}>
        The logo above is shown here in the Organizations list. Everything else per-organization (app icon, favicon,
        and other branding) is edited by selecting this organization to manage (use the arrow icon in the
        Organizations table) and opening System Settings there.
      </p>
    </FormModal>
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

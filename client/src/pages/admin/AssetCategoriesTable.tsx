import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { DataTable } from "../../components/DataTable";
import { FormModal } from "../../components/FormModal";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { PermissionGate } from "../../auth/PermissionGate";
import { CategoryColumnsModal } from "./CategoryColumnsModal";
import { ALL_CAPACITY_KEYS, CAPACITY_INFO, defaultCapacitiesFor, AssetCapacityKey } from "../assets/assetCapacities";
import { ChipSelect } from "../../components/ChipSelect";

interface FormTemplateRef {
  id: number;
  name: string;
}

interface CollectionRef {
  id: number;
  name: string;
}

interface AssetCategory {
  id: number;
  name: string;
  isComputerAsset: boolean;
  isShowAsset: boolean;
  isSwitchingDevice: boolean;
  formTemplateId: number | null;
  formTemplate: FormTemplateRef | null;
  collectionId: number | null;
  collection: CollectionRef | null;
  capacities: string[] | null;
  publicIntakeEnabled: boolean;
  publicIntakeToken: string | null;
}

export function AssetCategoriesTable() {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AssetCategory | null>(null);
  const [deleting, setDeleting] = useState<AssetCategory | null>(null);
  const [configuringColumns, setConfiguringColumns] = useState<AssetCategory | null>(null);
  const queryClient = useQueryClient();

  const { data: categories, isLoading } = useQuery({
    queryKey: ["asset-categories"],
    queryFn: async () => (await axiosClient.get("/asset-categories")).data as AssetCategory[],
  });
  const { data: templates } = useQuery({
    queryKey: ["asset-form-templates"],
    queryFn: async () => (await axiosClient.get("/asset-form-templates")).data,
  });
  const { data: collections } = useQuery({
    queryKey: ["asset-collections"],
    queryFn: async () => (await axiosClient.get("/asset-collections")).data as CollectionRef[],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/asset-categories/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["asset-categories"] }); setDeleting(null); },
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`/asset-categories/${id}/duplicate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["asset-categories"] }),
  });

  const columns: ColumnDef<AssetCategory, any>[] = [
    { header: "Name", accessorKey: "name" },
    {
      header: "Collection",
      accessorFn: (r) => r.collection?.name ?? "",
      cell: ({ row }) => row.original.collection ? <span className="badge badge-neutral">{row.original.collection.name}</span> : <span className="muted">—</span>,
    },
    {
      header: "Type",
      accessorFn: (r) => (r.isComputerAsset ? "Computer / Network" : "Generic"),
      cell: ({ row }) => (
        <span className={`badge ${row.original.isComputerAsset ? "badge-primary" : "badge-neutral"}`}>
          {row.original.isComputerAsset ? "Computer / Network" : "Generic"}
        </span>
      ),
    },
    {
      header: "Show Asset",
      accessorFn: (r) => (r.isShowAsset ? "Yes" : "No"),
      cell: ({ row }) =>
        row.original.isShowAsset ? <span className="badge badge-primary">Show Asset</span> : <span className="muted">—</span>,
    },
    {
      header: "Switching Device",
      accessorFn: (r) => (r.isSwitchingDevice ? "Yes" : "No"),
      cell: ({ row }) =>
        row.original.isSwitchingDevice ? <span className="badge badge-primary">Switching</span> : <span className="muted">—</span>,
    },
    {
      header: "Linked Form Template",
      accessorFn: (r) => r.formTemplate?.name ?? "",
      cell: ({ row }) =>
        row.original.formTemplate ? (
          <span className="badge badge-primary">{row.original.formTemplate.name}</span>
        ) : (
          <span className="muted">Not linked</span>
        ),
    },
    {
      header: "",
      id: "actions",
      cell: ({ row }) => (
        <div className="row gap-1">
          <PermissionGate module="admin" action="edit">
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing(row.original)}>
              <Icon name="edit" size={12} /> Edit
            </button>
          </PermissionGate>
          <PermissionGate module="admin" action="edit">
            <button className="btn btn-secondary btn-sm btn-icon" title="Configure columns" onClick={() => setConfiguringColumns(row.original)}>
              <Icon name="grid" size={12} />
            </button>
          </PermissionGate>
          <PermissionGate module="admin" action="duplicate">
            <button className="btn btn-secondary btn-sm btn-icon" title="Duplicate" onClick={() => duplicateMutation.mutate(row.original.id)}>
              <Icon name="paperclip" size={12} />
            </button>
          </PermissionGate>
          <PermissionGate module="admin" action="delete">
            <button className="btn btn-danger btn-sm btn-icon" onClick={() => setDeleting(row.original)}>
              <Icon name="trash" size={13} />
            </button>
          </PermissionGate>
        </div>
      ),
    },
  ];

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <h3 className="mt-0 mb-0">Asset Categories</h3>
        <PermissionGate module="admin" action="create">
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
            <Icon name="plus" size={13} /> Add Category
          </button>
        </PermissionGate>
      </div>
      <DataTable tableId="admin.assetCategories" exportModule="admin" columns={columns} data={categories ?? []} isLoading={isLoading} clientPageSize={8} defaultViewMode="list" emptyMessage="No asset categories yet." />

      {showForm && (
        <CategoryFormModal
          templates={templates ?? []}
          collections={collections ?? []}
          onClose={() => setShowForm(false)}
        />
      )}
      {editing && (
        <CategoryFormModal
          templates={templates ?? []}
          collections={collections ?? []}
          initial={editing}
          onClose={() => setEditing(null)}
        />
      )}

      {configuringColumns && (
        <CategoryColumnsModal categoryId={configuringColumns.id} onClose={() => setConfiguringColumns(null)} />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete asset category"
          message={`Are you sure you want to delete "${deleting.name}"? This cannot be undone.`}
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      )}
    </div>
  );
}

function CategoryFormModal({
  templates,
  collections,
  initial,
  onClose,
}: {
  templates: FormTemplateRef[];
  collections: CollectionRef[];
  initial?: AssetCategory;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [formTemplateId, setFormTemplateId] = useState<string>(initial?.formTemplateId ? String(initial.formTemplateId) : "");
  const defaultCollectionId = collections.find((c) => c.name === "IT Assets")?.id ?? collections[0]?.id;
  const [collectionId, setCollectionId] = useState<string>(initial ? String(initial.collectionId ?? "") : String(defaultCollectionId ?? ""));
  const [isComputerAsset, setIsComputerAsset] = useState(initial?.isComputerAsset ?? false);
  const [isShowAsset, setIsShowAsset] = useState(initial?.isShowAsset ?? false);
  const [isSwitchingDevice, setIsSwitchingDevice] = useState(initial?.isSwitchingDevice ?? false);
  const [customizeCapacities, setCustomizeCapacities] = useState(Array.isArray(initial?.capacities));
  const [capacities, setCapacities] = useState<AssetCapacityKey[]>(
    Array.isArray(initial?.capacities) ? (initial!.capacities as AssetCapacityKey[]) : defaultCapacitiesFor(initial?.isComputerAsset ?? false)
  );
  const [publicIntake, setPublicIntake] = useState({ enabled: initial?.publicIntakeEnabled ?? false, token: initial?.publicIntakeToken ?? null as string | null });
  const [linkCopied, setLinkCopied] = useState(false);
  const queryClient = useQueryClient();

  const enableIntakeMutation = useMutation({
    mutationFn: () => axiosClient.post(`/asset-categories/${initial!.id}/public-intake`),
    onSuccess: (res) => {
      setPublicIntake({ enabled: res.data.publicIntakeEnabled, token: res.data.publicIntakeToken });
      queryClient.invalidateQueries({ queryKey: ["asset-categories"] });
    },
  });
  const disableIntakeMutation = useMutation({
    mutationFn: () => axiosClient.delete(`/asset-categories/${initial!.id}/public-intake`),
    onSuccess: (res) => {
      setPublicIntake({ enabled: res.data.publicIntakeEnabled, token: res.data.publicIntakeToken });
      queryClient.invalidateQueries({ queryKey: ["asset-categories"] });
    },
  });
  const intakeUrl = publicIntake.token ? `${window.location.origin}/intake/${publicIntake.token}` : "";

  function toggleCapacity(key: AssetCapacityKey) {
    setCapacities((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        name,
        formTemplateId: formTemplateId ? Number(formTemplateId) : null,
        collectionId: collectionId ? Number(collectionId) : null,
        isComputerAsset,
        isShowAsset,
        isSwitchingDevice,
        capacities: customizeCapacities ? capacities : null,
      };
      return initial ? axiosClient.patch(`/asset-categories/${initial.id}`, payload) : axiosClient.post("/asset-categories", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset-categories"] });
      queryClient.invalidateQueries({ queryKey: ["asset-form-templates"] });
      queryClient.invalidateQueries({ queryKey: ["asset-collections"] });
      onClose();
    },
  });

  return (
    <FormModal
      title={initial ? "Edit Asset Category" : "Add Asset Category"}
      onClose={onClose}
      onSubmit={() => mutation.mutate()}
      submitting={mutation.isPending}
      submitDisabled={!name.trim()}
      submitLabel={initial ? "Save" : "Add Category"}
    >
      {mutation.isError && <div className="alert alert-danger">{(mutation.error as any)?.response?.data?.error ?? "Something went wrong."}</div>}
      <div className="field">
        <label>Name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="toggle-card">
        <div className="toggle-card-icon"><Icon name="cpu" size={16} /></div>
        <div className="toggle-card-body">
          <div className="toggle-card-title">Computer / Network Related Asset</div>
          <div className="toggle-card-desc">
            Assets in this category show the full IT menu (Operating Systems, Components, Volumes, Software, Connections,
            Network Ports, Sockets, Remote Management, Virtualization, Antiviruses). Leave off for a generic asset with
            just Profile, Impact Analysis, Location, Management, Contracts, Documents, Reports, and Logs.
          </div>
        </div>
        <label className="form-toggle-switch">
          <input type="checkbox" checked={isComputerAsset} onChange={(e) => setIsComputerAsset(e.target.checked)} />
          <span className="form-toggle-switch-track" />
        </label>
      </div>
      <div className="toggle-card">
        <div className="toggle-card-icon"><Icon name="activity" size={16} /></div>
        <div className="toggle-card-body">
          <div className="toggle-card-title">Show Asset</div>
          <div className="toggle-card-desc">
            Assets in this category are counted on the Operational Context page's Active Show Assets gauge, which pings
            each one live by its asset tag to report how many are currently reachable on the network.
          </div>
        </div>
        <label className="form-toggle-switch">
          <input type="checkbox" checked={isShowAsset} onChange={(e) => setIsShowAsset(e.target.checked)} />
          <span className="form-toggle-switch-track" />
        </label>
      </div>
      <div className="toggle-card">
        <div className="toggle-card-icon"><Icon name="network" size={16} /></div>
        <div className="toggle-card-body">
          <div className="toggle-card-title">Switching Device</div>
          <div className="toggle-card-desc">
            Assets in this category appear on the Network Topology Map's Switching tab, where their physical ports can be
            mapped (label, status, VLAN, and what's plugged into each one).
          </div>
        </div>
        <label className="form-toggle-switch">
          <input type="checkbox" checked={isSwitchingDevice} onChange={(e) => setIsSwitchingDevice(e.target.checked)} />
          <span className="form-toggle-switch-track" />
        </label>
      </div>
      <div className="toggle-card">
        <div className="toggle-card-icon"><Icon name="grid" size={16} /></div>
        <div className="toggle-card-body">
          <div className="toggle-card-title">Configure Capacities</div>
          <div className="toggle-card-desc">
            By default this category's Asset Detail tabs follow the standard rules above (Components
            follows Computer / Network Related Asset; Contracts, Documents, and Financial Info always
            show). Turn this on to independently choose exactly which of those tabs appear.
          </div>
        </div>
        <label className="form-toggle-switch">
          <input
            type="checkbox"
            checked={customizeCapacities}
            onChange={(e) => {
              setCustomizeCapacities(e.target.checked);
              if (e.target.checked) setCapacities(defaultCapacitiesFor(isComputerAsset));
            }}
          />
          <span className="form-toggle-switch-track" />
        </label>
      </div>
      {customizeCapacities && (
        <div className="field">
          <label>Capacities</label>
          <div className="grid gap-1">
            {ALL_CAPACITY_KEYS.map((key) => (
              <label key={key} className="row gap-2" style={{ alignItems: "flex-start", fontSize: 13, border: "1px solid var(--color-border)", borderRadius: 6, padding: "8px 10px" }}>
                <input type="checkbox" checked={capacities.includes(key)} onChange={() => toggleCapacity(key)} style={{ marginTop: 2 }} />
                <span>
                  <div style={{ fontWeight: 600 }}>{CAPACITY_INFO[key].label}</div>
                  <div className="muted" style={{ fontSize: 11 }}>{CAPACITY_INFO[key].description}</div>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
      {initial && (
        <div className="toggle-card" style={{ flexWrap: "wrap" }}>
          <div className="toggle-card-icon"><Icon name="link" size={16} /></div>
          <div className="toggle-card-body">
            <div className="toggle-card-title">Public Intake Form</div>
            <div className="toggle-card-desc">
              Generates a shareable, no-login link where anyone can propose a new asset for this category. Submissions never
              create an asset directly — they land in a review queue (Admin &amp; Setup → Asset Intake) for a staff member to
              approve or reject first.
            </div>
            {publicIntake.enabled && publicIntake.token && (
              <div className="row gap-2" style={{ marginTop: 8, alignItems: "center" }}>
                <input className="input" readOnly value={intakeUrl} style={{ fontSize: 11.5, flex: 1, minWidth: 0 }} onFocus={(e) => e.target.select()} />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => { navigator.clipboard.writeText(intakeUrl); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1500); }}
                >
                  <Icon name={linkCopied ? "check" : "paperclip"} size={12} /> {linkCopied ? "Copied" : "Copy"}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" disabled={enableIntakeMutation.isPending} onClick={() => enableIntakeMutation.mutate()}>
                  <Icon name="refresh" size={12} /> Rotate
                </button>
              </div>
            )}
          </div>
          <label className="form-toggle-switch">
            <input
              type="checkbox"
              checked={publicIntake.enabled}
              onChange={(e) => (e.target.checked ? enableIntakeMutation.mutate() : disableIntakeMutation.mutate())}
            />
            <span className="form-toggle-switch-track" />
          </label>
        </div>
      )}
      <div className="field">
        <label>Collection</label>
        <ChipSelect
          value={collectionId}
          onChange={setCollectionId}
          placeholder="None"
          options={[{ value: "", label: "None" }, ...collections.map((c) => ({ value: String(c.id), label: c.name }))]}
        />
      </div>
      <div className="field">
        <label>Linked Form Template</label>
        <ChipSelect
          value={formTemplateId}
          onChange={setFormTemplateId}
          placeholder="None — use standard asset fields only"
          options={[{ value: "", label: "None — use standard asset fields only" }, ...templates.map((t) => ({ value: String(t.id), label: t.name }))]}
        />
      </div>
      <p className="muted" style={{ fontSize: 12 }}>
        When this category is selected on an asset, the linked form template's custom fields appear on the Add/Edit Asset form.
        Manage templates and their fields in the Form Templates section below.
      </p>
    </FormModal>
  );
}

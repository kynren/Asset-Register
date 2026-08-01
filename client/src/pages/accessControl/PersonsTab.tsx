import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { DataTable } from "../../components/DataTable";
import { FormModal } from "../../components/FormModal";
import { Icon } from "../../components/Icon";
import { PermissionGate } from "../../auth/PermissionGate";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useUserPreference } from "../../hooks/useUserPreference";

interface Organization {
  id: number;
  name: string;
  parentId: number | null;
}
interface PersonCard {
  id: number;
  cardNumber: string;
  cardType: string;
}
interface Person {
  id: number;
  personId: string;
  name: string;
  gender: "MALE" | "FEMALE";
  email: string | null;
  phone: string | null;
  organizationId: number | null;
  organization: { id: number; name: string } | null;
  validFrom: string | null;
  validTo: string | null;
  longTermEffective: boolean;
  remark: string | null;
  cards: PersonCard[];
  createdAt: string;
}

interface OrgNode extends Organization {
  children: OrgNode[];
}

function buildOrgTree(orgs: Organization[]): OrgNode[] {
  const byId = new Map<number, OrgNode>(orgs.map((o) => [o.id, { ...o, children: [] }]));
  const roots: OrgNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId)!.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export function PersonsTab() {
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [editingPerson, setEditingPerson] = useState<Person | null | "new">(null);
  const [deletingPerson, setDeletingPerson] = useState<Person | null>(null);
  const [addingOrgParentId, setAddingOrgParentId] = useState<number | null | undefined>(undefined);
  const [deletingOrg, setDeletingOrg] = useState<Organization | null>(null);
  const queryClient = useQueryClient();

  const { data: organizations } = useQuery({
    queryKey: ["access-control-organizations"],
    queryFn: async () => (await axiosClient.get("/access-control/organizations")).data as Organization[],
  });

  const { data: persons, isLoading } = useQuery({
    queryKey: ["access-control-persons", selectedOrgId, search],
    queryFn: async () =>
      (await axiosClient.get("/access-control/persons", { params: { organizationId: selectedOrgId ?? undefined, search: search || undefined } })).data as Person[],
  });

  function invalidatePersons() {
    queryClient.invalidateQueries({ queryKey: ["access-control-persons"] });
  }
  function invalidateOrgs() {
    queryClient.invalidateQueries({ queryKey: ["access-control-organizations"] });
  }

  const deletePersonMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/access-control/persons/${id}`),
    onSuccess: () => { invalidatePersons(); setDeletingPerson(null); },
  });

  const deleteOrgMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/access-control/organizations/${id}`),
    onSuccess: () => { invalidateOrgs(); setDeletingOrg(null); if (selectedOrgId === deletingOrg?.id) setSelectedOrgId(null); },
  });

  const orgTree = useMemo(() => buildOrgTree(organizations ?? []), [organizations]);

  function renderOrgNode(node: OrgNode, depth: number) {
    return (
      <div key={node.id}>
        <div
          className="row gap-1"
          style={{ alignItems: "center", padding: "4px 6px", paddingLeft: 6 + depth * 14, borderRadius: 6, cursor: "pointer", background: selectedOrgId === node.id ? "var(--color-primary-soft)" : "transparent" }}
        >
          <span onClick={() => setSelectedOrgId(node.id)} style={{ flex: 1, fontSize: 13 }}>{node.name}</span>
          <PermissionGate module="access-control" action="create">
            <button className="btn-icon" style={{ opacity: 0.6 }} title="Add sub-organization" onClick={() => setAddingOrgParentId(node.id)}>
              <Icon name="plus" size={11} />
            </button>
          </PermissionGate>
          <PermissionGate module="access-control" action="delete">
            <button className="btn-icon" style={{ opacity: 0.6 }} title="Delete organization" onClick={() => setDeletingOrg(node)}>
              <Icon name="trash" size={11} />
            </button>
          </PermissionGate>
        </div>
        {node.children.map((c) => renderOrgNode(c, depth + 1))}
      </div>
    );
  }

  const columns: ColumnDef<Person, any>[] = [
    { header: "Person ID", accessorKey: "personId" },
    { header: "Name", accessorKey: "name" },
    { header: "Organization", accessorFn: (p) => p.organization?.name ?? "—" },
    { header: "Cards", accessorFn: (p) => p.cards.length },
    {
      header: "Validity",
      cell: ({ row }) => {
        const p = row.original;
        if (p.longTermEffective) return "Long-term";
        if (!p.validFrom && !p.validTo) return "—";
        return `${p.validFrom ? dayjs(p.validFrom).format("DD MMM YYYY") : "…"} – ${p.validTo ? dayjs(p.validTo).format("DD MMM YYYY") : "…"}`;
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="row gap-1">
          <PermissionGate module="access-control" action="edit">
            <button className="btn btn-secondary btn-sm btn-icon" onClick={(e) => { e.stopPropagation(); setEditingPerson(row.original); }} title="Edit"><Icon name="edit" size={12} /></button>
          </PermissionGate>
          <PermissionGate module="access-control" action="delete">
            <button className="btn btn-danger btn-sm btn-icon" onClick={(e) => { e.stopPropagation(); setDeletingPerson(row.original); }} title="Delete"><Icon name="trash" size={12} /></button>
          </PermissionGate>
        </div>
      ),
    },
  ];

  return (
    <div className="row gap-3" style={{ alignItems: "flex-start" }}>
      <div className="card" style={{ width: 230, flexShrink: 0 }}>
        <div className="row gap-2" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <strong style={{ fontSize: 13 }}>Organizations</strong>
          <PermissionGate module="access-control" action="create">
            <button className="btn-icon" onClick={() => setAddingOrgParentId(null)} title="Add top-level organization"><Icon name="plus" size={13} /></button>
          </PermissionGate>
        </div>
        <div
          onClick={() => setSelectedOrgId(null)}
          style={{ padding: "4px 6px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600, background: selectedOrgId === null ? "var(--color-primary-soft)" : "transparent", marginBottom: 4 }}
        >
          All Persons
        </div>
        {orgTree.map((n) => renderOrgNode(n, 0))}
        {orgTree.length === 0 && <p className="muted" style={{ fontSize: 12 }}>No organizations yet.</p>}
      </div>

      <div className="stack gap-3" style={{ flex: 1, minWidth: 0 }}>
        <div className="row gap-2 flex-wrap" style={{ justifyContent: "space-between" }}>
          <PermissionGate module="access-control" action="create">
            <button className="btn btn-primary" onClick={() => setEditingPerson("new")}><Icon name="plus" size={14} /> Add</button>
          </PermissionGate>
          <input className="input" placeholder="Search name or Person ID..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 240 }} />
        </div>

        <div className="card">
          <DataTable columns={columns} data={persons ?? []} isLoading={isLoading} clientPageSize={10} onRowClick={(p) => setEditingPerson(p)} emptyMessage="No persons enrolled yet." />
        </div>
      </div>

      {editingPerson && (
        <EditPersonModal
          // Re-resolve against the live query result (not the stale row snapshot captured at
          // click time) so actions inside the modal that only invalidate the list query — like
          // adding/removing a card — are reflected without the user having to close and reopen it.
          person={editingPerson === "new" ? null : (persons?.find((p) => p.id === editingPerson.id) ?? editingPerson)}
          organizations={organizations ?? []}
          onClose={() => setEditingPerson(null)}
          onSaved={invalidatePersons}
        />
      )}

      {addingOrgParentId !== undefined && (
        <AddOrganizationModal parentId={addingOrgParentId} onClose={() => setAddingOrgParentId(undefined)} onSaved={invalidateOrgs} />
      )}

      {deletingPerson && (
        <ConfirmDialog
          title="Delete person"
          message={`Remove "${deletingPerson.name}" from the directory? This also removes any enrolled credentials. This cannot be undone.`}
          danger
          loading={deletePersonMutation.isPending}
          onCancel={() => setDeletingPerson(null)}
          onConfirm={() => deletePersonMutation.mutate(deletingPerson.id)}
        />
      )}

      {deletingOrg && (
        <ConfirmDialog
          title="Delete organization"
          message={`Delete "${deletingOrg.name}" and any sub-organizations? Persons in it are kept but unassigned. This cannot be undone.`}
          danger
          loading={deleteOrgMutation.isPending}
          onCancel={() => setDeletingOrg(null)}
          onConfirm={() => deleteOrgMutation.mutate(deletingOrg.id)}
        />
      )}
    </div>
  );
}

function AddOrganizationModal({ parentId, onClose, onSaved }: { parentId: number | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const mutation = useMutation({
    mutationFn: () => axiosClient.post("/access-control/organizations", { name, parentId }),
    onSuccess: () => { onSaved(); onClose(); },
  });
  return (
    <FormModal title={parentId ? "Add Sub-Organization" : "Add Organization"} onClose={onClose} onSubmit={() => mutation.mutate()} submitting={mutation.isPending} submitDisabled={!name.trim()}>
      <div className="field"><label>Name *</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
    </FormModal>
  );
}

type PersonTab = "basic" | "credential" | "access";

function EditPersonModal({
  person,
  organizations,
  onClose,
  onSaved,
}: {
  person: Person | null;
  organizations: Organization[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<PersonTab>("basic");
  const [personId, setPersonId] = useState(person?.personId ?? "");
  const [name, setName] = useState(person?.name ?? "");
  const [gender, setGender] = useState<"MALE" | "FEMALE">(person?.gender ?? "MALE");
  const [email, setEmail] = useState(person?.email ?? "");
  const [phone, setPhone] = useState(person?.phone ?? "");
  const [organizationId, setOrganizationId] = useState<number | "">(person?.organizationId ?? "");
  const [validFrom, setValidFrom] = useState(person?.validFrom ? person.validFrom.slice(0, 10) : "");
  const [validTo, setValidTo] = useState(person?.validTo ? person.validTo.slice(0, 10) : "");
  const [longTermEffective, setLongTermEffective] = useState(person?.longTermEffective ?? false);
  const [remark, setRemark] = useState(person?.remark ?? "");
  const [addingCard, setAddingCard] = useState(false);
  const queryClient = useQueryClient();

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["access-control-persons"] });
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        personId,
        name,
        gender,
        email: email || undefined,
        phone: phone || undefined,
        organizationId: organizationId === "" ? null : organizationId,
        validFrom: validFrom ? new Date(validFrom).toISOString() : null,
        validTo: validTo ? new Date(validTo).toISOString() : null,
        longTermEffective,
        remark: remark || undefined,
      };
      return person ? axiosClient.patch(`/access-control/persons/${person.id}`, body) : axiosClient.post("/access-control/persons", body);
    },
    onSuccess: () => { invalidate(); onSaved(); onClose(); },
  });

  const deleteCardMutation = useMutation({
    mutationFn: (cardId: number) => axiosClient.delete(`/access-control/persons/${person!.id}/cards/${cardId}`),
    onSuccess: invalidate,
  });

  const TABS: { key: PersonTab; label: string }[] = [
    { key: "basic", label: "Basic Information" },
    { key: "credential", label: "Credential" },
    { key: "access", label: "Access Control" },
  ];

  return (
    <FormModal
      title={person ? "Edit Person" : "Add Person"}
      onClose={onClose}
      onSubmit={tab === "basic" || !person ? () => saveMutation.mutate() : undefined}
      submitting={saveMutation.isPending}
      submitDisabled={!personId.trim() || !name.trim()}
      maxWidth={680}
    >
      {saveMutation.isError && <div className="alert alert-danger">{(saveMutation.error as any)?.response?.data?.error ?? "Could not save this person."}</div>}
      <div className="row gap-2" style={{ borderBottom: "1px solid var(--color-border)", marginBottom: 14 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`btn btn-sm ${tab === t.key ? "btn-primary" : "btn-secondary"}`}
            disabled={t.key !== "basic" && !person}
            title={t.key !== "basic" && !person ? "Save the person first" : undefined}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "basic" && (
        <>
          <div className="grid grid-cols-2">
            <div className="field"><label>Person ID *</label><input className="input" value={personId} onChange={(e) => setPersonId(e.target.value)} placeholder="e.g. 00000005" /></div>
            <div className="field"><label>Name *</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="field">
              <label>Gender</label>
              <div className="row gap-2" style={{ alignItems: "center", height: 38 }}>
                <label className="row gap-1" style={{ alignItems: "center", fontSize: 13, cursor: "pointer" }}><input type="radio" checked={gender === "MALE"} onChange={() => setGender("MALE")} /> Male</label>
                <label className="row gap-1" style={{ alignItems: "center", fontSize: 13, cursor: "pointer" }}><input type="radio" checked={gender === "FEMALE"} onChange={() => setGender("FEMALE")} /> Female</label>
              </div>
            </div>
            <div className="field">
              <label>Organization</label>
              <select className="select" value={organizationId} onChange={(e) => setOrganizationId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">Unassigned</option>
                {organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div className="field"><label>Email</label><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="field"><label>Tel.</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <div className="field"><label>Valid From</label><input className="input" type="date" value={validFrom} disabled={longTermEffective} onChange={(e) => setValidFrom(e.target.value)} /></div>
            <div className="field"><label>Valid To</label><input className="input" type="date" value={validTo} disabled={longTermEffective} onChange={(e) => setValidTo(e.target.value)} /></div>
          </div>
          <label className="row gap-1" style={{ fontSize: 13, cursor: "pointer", marginBottom: 12 }}>
            <input type="checkbox" checked={longTermEffective} onChange={(e) => setLongTermEffective(e.target.checked)} />
            Long-Term Effective
          </label>
          <div className="field"><label>Remark</label><textarea className="input" rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} /></div>
        </>
      )}

      {tab === "credential" && person && (
        <div className="stack gap-3">
          <strong style={{ fontSize: 13 }}>Card</strong>
          <div className="row gap-2 flex-wrap">
            {person.cards.map((c) => (
              <div key={c.id} className="card" style={{ padding: "10px 14px", minWidth: 150, position: "relative" }}>
                <PermissionGate module="access-control" action="edit">
                  <button
                    className="btn-icon"
                    style={{ position: "absolute", top: 4, right: 4, opacity: 0.6 }}
                    onClick={() => deleteCardMutation.mutate(c.id)}
                    title="Remove card"
                  >
                    <Icon name="close" size={12} />
                  </button>
                </PermissionGate>
                <div className="row gap-2" style={{ alignItems: "center" }}>
                  <Icon name="key" size={22} />
                  <div>
                    <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 13 }}>{c.cardNumber}</div>
                    <div className="muted" style={{ fontSize: 11 }}>{c.cardType}</div>
                  </div>
                </div>
              </div>
            ))}
            <PermissionGate module="access-control" action="edit">
              <button
                onClick={() => setAddingCard(true)}
                className="row"
                style={{
                  width: 90, height: 64, alignItems: "center", justifyContent: "center", borderRadius: 8,
                  border: "2px dashed var(--color-border)", background: "transparent", cursor: "pointer", color: "var(--color-primary)",
                }}
                title="Add card"
              >
                <Icon name="plus" size={20} />
              </button>
            </PermissionGate>
          </div>

          {addingCard && (
            <AddCardModal personId={person.id} onClose={() => setAddingCard(false)} onSaved={invalidate} />
          )}
        </div>
      )}

      {tab === "access" && person && (
        <p className="muted" style={{ fontSize: 13 }}>
          Door access for this person is managed under <strong>Access Group</strong> — add them to a group there to grant access to specific doors on a schedule.
        </p>
      )}
    </FormModal>
  );
}

const CARD_TYPES = ["Normal Card", "Visitor Card", "Duress Card", "Patrol Card"];

interface AccessControlDeviceOption {
  id: number;
  name: string;
  ipAddress: string | null;
}

// Mirrors the "Add" card dialog in Hikvision's own iVMS-4200 Person screen: type a card number
// or tap a physical card at a reader wired to one of this org's access control devices and have
// its number filled in automatically. "Read" is a real ISAPI call (captureCardId in
// hikvisionIsapi.ts) — it is NOT verified against physical card-reader hardware in this codebase
// yet, so if it fails against a real controller, that's the first thing to check.
function AddCardModal({ personId, onClose, onSaved }: { personId: number; onClose: () => void; onSaved: () => void }) {
  const [cardNumber, setCardNumber] = useState("");
  const [cardType, setCardType] = useState(CARD_TYPES[0]);
  const [showSettings, setShowSettings] = useState(false);
  const queryClient = useQueryClient();

  const { data: devices } = useQuery({
    queryKey: ["access-control-devices"],
    queryFn: async () => (await axiosClient.get("/access-control/devices")).data as AccessControlDeviceOption[],
  });
  const readableDevices = (devices ?? []).filter((d) => d.ipAddress);

  const { value: readerDeviceId, setValue: setReaderDeviceId } = useUserPreference<number | null>("accessControl.cardReaderDeviceId", null);
  const effectiveReaderId = readableDevices.some((d) => d.id === readerDeviceId) ? readerDeviceId : (readableDevices[0]?.id ?? null);
  const readerDevice = readableDevices.find((d) => d.id === effectiveReaderId) ?? null;

  const readMutation = useMutation({
    mutationFn: () => axiosClient.post(`/access-control/devices/${effectiveReaderId}/capture-card`),
    onSuccess: (res) => {
      const data = res.data as { ok: boolean; cardNo: string | null };
      if (data.ok && data.cardNo) setCardNumber(data.cardNo);
    },
  });
  const readResult = readMutation.data?.data as { ok: boolean; message: string } | undefined;

  const addMutation = useMutation({
    mutationFn: () => axiosClient.post(`/access-control/persons/${personId}/cards`, { cardNumber, cardType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["access-control-persons"] });
      onSaved();
      onClose();
    },
  });

  return (
    <div className="modal-overlay" style={{ zIndex: 200 }} onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Add</h3>
          <button className="modal-close" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>

        {addMutation.isError && <div className="alert alert-danger">{(addMutation.error as any)?.response?.data?.error ?? "Could not add this card."}</div>}
        {readResult && !readResult.ok && <div className="alert alert-danger" style={{ fontSize: 12 }}>{readResult.message}</div>}

        <div className="field">
          <label>Card No.</label>
          <div className="row gap-2">
            <input className="input" value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} placeholder="Type it or tap a card" style={{ flex: 1 }} autoFocus />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!readerDevice || readMutation.isPending}
              title={readerDevice ? `Read from ${readerDevice.name}` : "No card reader configured — see Settings"}
              onClick={() => readMutation.mutate()}
            >
              {readMutation.isPending ? "Reading…" : "Read"}
            </button>
          </div>
        </div>

        <div className="field">
          <label>Card Type</label>
          <select className="select" value={cardType} onChange={(e) => setCardType(e.target.value)}>
            {CARD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="row gap-2" style={{ justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
          <button type="button" className="btn-icon row gap-1" style={{ width: "auto", fontSize: 12, color: "var(--color-text-muted)" }} onClick={() => setShowSettings(true)}>
            <Icon name="wrench" size={13} /> Settings
          </button>
          <div className="row gap-2">
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={!cardNumber.trim() || addMutation.isPending} onClick={() => addMutation.mutate()}>
              {addMutation.isPending ? "Adding..." : "Add"}
            </button>
          </div>
        </div>
      </div>

      {showSettings && (
        <ReaderSettingsModal
          devices={readableDevices}
          currentId={effectiveReaderId}
          onClose={() => setShowSettings(false)}
          onSave={(id) => { setReaderDeviceId(id); setShowSettings(false); }}
        />
      )}
    </div>
  );
}

// Which access control device's reader "Read" should capture from — persisted per-user since a
// site with several controllers likely has one operator's desk near a specific reader.
function ReaderSettingsModal({
  devices,
  currentId,
  onClose,
  onSave,
}: {
  devices: AccessControlDeviceOption[];
  currentId: number | null;
  onClose: () => void;
  onSave: (id: number | null) => void;
}) {
  const [selected, setSelected] = useState<number | "">(currentId ?? "");
  return (
    <div className="modal-overlay" style={{ zIndex: 250 }} onClick={onClose}>
      <div className="modal" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Card Reader Settings</h3>
          <button className="modal-close" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className="field">
          <label>Read cards from</label>
          <select className="select" value={selected} onChange={(e) => setSelected(e.target.value ? Number(e.target.value) : "")}>
            <option value="">No reader (type card numbers manually)</option>
            {devices.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.ipAddress})</option>)}
          </select>
          {devices.length === 0 && (
            <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>
              No access control device with an IP address is registered yet — add one under Devices &amp; Doors first.
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave(selected === "" ? null : selected)}>Save</button>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { DataTable } from "../../components/DataTable";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useToast } from "../../components/toast/ToastProvider";
import { VaultEntry } from "./VaultEntryRow";
import { VaultEntryModal, VaultEntryFormValues } from "./VaultEntryModal";
import { CryptoVaultModal } from "./CryptoVaultModal";

const DEFAULT_AUTO_LOCK_SECONDS = 60;

function faviconFor(url: string | null) {
  if (!url) return null;
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  } catch {
    return null;
  }
}

export function VaultTab() {
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<VaultEntry | null>(null);
  const [deleting, setDeleting] = useState<VaultEntry | null>(null);
  const [viewing, setViewing] = useState<VaultEntry | null>(null);
  const [copyingId, setCopyingId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["vault"],
    queryFn: async () => (await axiosClient.get("/vault")).data as VaultEntry[],
  });

  const { data: vaultSettings } = useQuery({
    queryKey: ["vault-settings"],
    queryFn: async () => (await axiosClient.get("/vault/settings")).data as { decryptTimeoutSeconds: number },
  });
  const autoLockSeconds = vaultSettings?.decryptTimeoutSeconds ?? DEFAULT_AUTO_LOCK_SECONDS;

  const createMutation = useMutation({
    mutationFn: (v: VaultEntryFormValues) => axiosClient.post("/vault", v),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["vault"] }); setShowAdd(false); },
  });

  const updateMutation = useMutation({
    mutationFn: (v: VaultEntryFormValues) => axiosClient.patch(`/vault/${editing!.id}`, { ...v, password: v.password || undefined }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["vault"] }); setEditing(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: () => axiosClient.delete(`/vault/${deleting!.id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["vault"] }); setDeleting(null); },
    meta: { successMessage: "Password deleted" },
  });

  async function handleQuickCopy(entry: VaultEntry) {
    setCopyingId(entry.id);
    try {
      const res = await axiosClient.post(`/vault/${entry.id}/reveal`);
      await navigator.clipboard.writeText(res.data.password);
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId((id) => (id === entry.id ? null : id)), 1800);
    } catch (err: any) {
      showToast({ variant: "error", title: "Couldn't copy password", message: err?.response?.data?.error ?? "Something went wrong decrypting this entry." });
    } finally {
      setCopyingId(null);
    }
  }

  const columns: ColumnDef<VaultEntry, any>[] = [
    {
      header: "Title",
      accessorKey: "title",
      meta: { cardTitle: true },
      cell: ({ row }) => {
        const entry = row.original;
        const favicon = faviconFor(entry.websiteUrl);
        return (
          <div className="row gap-2" style={{ alignItems: "center" }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: "var(--color-primary-soft)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
              {favicon ? <img src={favicon} alt="" width={16} height={16} /> : <Icon name="password" size={13} />}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{entry.title}</div>
              <div className="muted" style={{ fontSize: 11 }}>{entry.username || "—"}</div>
            </div>
          </div>
        );
      },
    },
    {
      header: "Website",
      id: "website",
      cell: ({ row }) =>
        row.original.websiteUrl ? (
          <a
            href={row.original.websiteUrl.startsWith("http") ? row.original.websiteUrl : `https://${row.original.websiteUrl}`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{ fontSize: 12 }}
          >
            Visit
          </a>
        ) : (
          <span className="muted">—</span>
        ),
    },
    { header: "Updated", id: "updatedAt", accessorFn: (e) => dayjs(e.updatedAt).format("DD MMM YYYY") },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const entry = row.original;
        return (
          <div className="row gap-2" onClick={(e) => e.stopPropagation()}>
            <button className="btn btn-secondary btn-sm btn-icon" title="Decrypt and view password" onClick={() => setViewing(entry)}>
              <Icon name="eye" size={13} />
            </button>
            <button className="btn btn-secondary btn-sm btn-icon" title="Copy password" disabled={copyingId === entry.id} onClick={() => handleQuickCopy(entry)}>
              <Icon name={copiedId === entry.id ? "check" : "paperclip"} size={13} />
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing(entry)}>Edit</button>
            <button className="btn btn-danger btn-sm btn-icon" onClick={() => setDeleting(entry)}><Icon name="trash" size={13} /></button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="stack gap-3">
      <div className="card">
        <div className="row gap-2" style={{ justifyContent: "space-between", marginBottom: 4 }}>
          <div>
            <h3 className="mt-0 mb-0">Password Vault</h3>
            <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
              Securely store website and app credentials, encrypted with AES-128. Only visible to you.
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Icon name="plus" size={14} /> Add Password</button>
        </div>

        <DataTable
          tableId="password.vault"
          columns={columns}
          data={data ?? []}
          isLoading={isLoading}
          emptyMessage="No saved passwords yet. Add your first one to get started."
        />
      </div>

      {showAdd && (
        <VaultEntryModal onClose={() => setShowAdd(false)} onSubmit={(v) => createMutation.mutate(v)} submitting={createMutation.isPending} />
      )}
      {editing && (
        <VaultEntryModal
          initial={{ title: editing.title, websiteUrl: editing.websiteUrl ?? "", username: editing.username ?? "", notes: editing.notes ?? "", password: "" }}
          onClose={() => setEditing(null)}
          onSubmit={(v) => updateMutation.mutate(v)}
          submitting={updateMutation.isPending}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete password"
          message={`Delete the saved password for "${deleting.title}"? This cannot be undone.`}
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate()}
        />
      )}
      {viewing && (
        <CryptoVaultModal
          entryId={viewing.id}
          entryTitle={viewing.title}
          autoLockSeconds={autoLockSeconds}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

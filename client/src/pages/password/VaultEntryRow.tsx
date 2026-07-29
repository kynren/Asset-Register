import { useState } from "react";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { useCryptoReveal } from "../../hooks/useCryptoReveal";

export interface VaultEntry {
  id: number;
  title: string;
  websiteUrl: string | null;
  username: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

function faviconFor(url: string | null) {
  if (!url) return null;
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  } catch {
    return null;
  }
}

export function VaultEntryRow({ entry, onEdit, onDelete }: { entry: VaultEntry; onEdit: () => void; onDelete: () => void }) {
  const { phase, display, reveal, hide } = useCryptoReveal(12);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const favicon = faviconFor(entry.websiteUrl);

  async function handleToggleReveal() {
    if (phase === "revealed" || phase === "decrypting") {
      hide();
      return;
    }
    setLoading(true);
    try {
      const res = await axiosClient.post(`/vault/${entry.id}/reveal`);
      reveal(res.data.password as string);
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    setLoading(true);
    try {
      const res = await axiosClient.post(`/vault/${entry.id}/reveal`);
      await navigator.clipboard.writeText(res.data.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="row gap-3" style={{ padding: "12px 4px", borderBottom: "1px solid var(--color-border)", alignItems: "center" }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--color-primary-soft)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
        {favicon ? <img src={favicon} alt="" width={20} height={20} /> : <Icon name="password" size={16} />}
      </div>

      <div style={{ minWidth: 160 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{entry.title}</div>
        <div className="muted" style={{ fontSize: 12 }}>{entry.username || "—"}</div>
      </div>

      <div className="flex-1 row gap-2" style={{ alignItems: "center" }}>
        <span
          style={{
            fontFamily: "monospace",
            fontSize: 13,
            letterSpacing: phase === "hidden" ? 2 : 0.5,
            minWidth: 140,
            color: phase === "revealed" ? "var(--color-success)" : phase === "decrypting" ? "var(--color-primary)" : undefined,
            transition: "color 0.2s ease",
          }}
        >
          {display}
        </span>
        <button className="btn btn-secondary btn-sm btn-icon" onClick={handleToggleReveal} disabled={loading} title={phase === "revealed" ? "Hide password" : "Decrypt and view password"}>
          <Icon name={phase === "revealed" ? "eyeOff" : "eye"} size={13} />
        </button>
        <button className="btn btn-secondary btn-sm btn-icon" onClick={handleCopy} disabled={loading} title="Copy password">
          <Icon name={copied ? "check" : "paperclip"} size={13} />
        </button>
      </div>

      {entry.websiteUrl && (
        <a href={entry.websiteUrl.startsWith("http") ? entry.websiteUrl : `https://${entry.websiteUrl}`} target="_blank" rel="noreferrer" className="muted" style={{ fontSize: 12 }}>
          Visit
        </a>
      )}
      <button className="btn btn-secondary btn-sm" onClick={onEdit}>Edit</button>
      <button className="btn btn-danger btn-sm btn-icon" onClick={onDelete}><Icon name="trash" size={13} /></button>
    </div>
  );
}

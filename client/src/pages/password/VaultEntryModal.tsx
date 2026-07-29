import { useState } from "react";
import { FormModal } from "../../components/FormModal";

export interface VaultEntryFormValues {
  title: string;
  websiteUrl: string;
  username: string;
  password: string;
  notes: string;
}

const empty: VaultEntryFormValues = { title: "", websiteUrl: "", username: "", password: "", notes: "" };

export function VaultEntryModal({
  initial,
  onClose,
  onSubmit,
  submitting,
}: {
  initial?: Partial<VaultEntryFormValues>;
  onClose: () => void;
  onSubmit: (v: VaultEntryFormValues) => void;
  submitting?: boolean;
}) {
  const [values, setValues] = useState<VaultEntryFormValues>({ ...empty, ...initial });

  function update<K extends keyof VaultEntryFormValues>(key: K, value: VaultEntryFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function generatePassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
    let out = "";
    const bytes = new Uint32Array(18);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < 18; i++) out += chars[bytes[i] % chars.length];
    update("password", out);
  }

  return (
    <FormModal title={initial ? "Edit Password" : "Add Password"} onClose={onClose} onSubmit={() => onSubmit(values)} submitting={submitting} maxWidth={480}>
      <div className="field">
        <label>Title *</label>
        <input className="input" value={values.title} onChange={(e) => update("title", e.target.value)} placeholder="e.g. Company VPN, Office 365..." required />
      </div>
      <div className="field">
        <label>Website URL</label>
        <input className="input" value={values.websiteUrl} onChange={(e) => update("websiteUrl", e.target.value)} placeholder="https://..." />
      </div>
      <div className="field">
        <label>Username / Email</label>
        <input className="input" value={values.username} onChange={(e) => update("username", e.target.value)} autoComplete="off" />
      </div>
      <div className="field">
        <label>Password {initial ? "(leave blank to keep current)" : "*"}</label>
        <div className="row gap-2">
          <input className="input" value={values.password} onChange={(e) => update("password", e.target.value)} autoComplete="new-password" required={!initial} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={generatePassword}>Generate</button>
        </div>
      </div>
      <div className="field">
        <label>Notes</label>
        <textarea className="input" rows={2} value={values.notes} onChange={(e) => update("notes", e.target.value)} />
      </div>
      <p className="muted" style={{ fontSize: 12 }}>Encrypted with AES-128 before storage. Only you can decrypt and view it.</p>
    </FormModal>
  );
}

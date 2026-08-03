import { useState } from "react";
import { FormModal } from "../../components/FormModal";
import { PasswordInput } from "../../components/PasswordInput";
import { useAuth } from "../../auth/AuthContext";
import { ChipSelect } from "../../components/ChipSelect";

const REMEMBER_OPTIONS: { label: string; minutes: number | null }[] = [
  { label: "1 hour", minutes: 60 },
  { label: "8 hours", minutes: 8 * 60 },
  { label: "24 hours", minutes: 24 * 60 },
  { label: "Until I log out", minutes: null },
];

// Re-verifies the System Admin's own identity (password or PIN, same shared lockout as login)
// before switching into a target organization — replaces what used to be a bare confirm-click.
export function OrgSwitchConfirmModal({
  organizationName,
  submitting,
  error,
  onCancel,
  onConfirm,
}: {
  organizationName: string;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (credential: { password: string } | { pin: string }, rememberMinutes: number | null) => void;
}) {
  const { user } = useAuth();
  const [usePin, setUsePin] = useState(false);
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [rememberMinutes, setRememberMinutes] = useState<number | null>(60);

  const canSubmit = usePin ? pin.length === 6 : password.length > 0;

  function handleSubmit() {
    if (!canSubmit) return;
    onConfirm(usePin ? { pin } : { password }, rememberMinutes);
  }

  return (
    <FormModal
      title={`Manage ${organizationName}?`}
      onClose={onCancel}
      onSubmit={handleSubmit}
      submitLabel="Confirm"
      submitting={submitting}
      submitDisabled={!canSubmit}
      maxWidth={420}
    >
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        You are about to manage this organization. Changes you save here take effect immediately for its users. Re-enter your
        password or PIN to continue.
      </p>
      {error && <div className="alert alert-danger">{error}</div>}

      {usePin ? (
        <div className="field">
          <label>PIN</label>
          <input
            className="input"
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            autoFocus
          />
        </div>
      ) : (
        <div className="field">
          <label>Password</label>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </div>
      )}

      {user?.pinEnabled && (
        <button
          type="button"
          className="muted"
          style={{ fontSize: 12, background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}
          onClick={() => { setUsePin((v) => !v); setPassword(""); setPin(""); }}
        >
          {usePin ? "Use password instead" : "Use PIN instead"}
        </button>
      )}

      <div className="field" style={{ marginTop: 12 }}>
        <label>Stay switched for</label>
        <ChipSelect
          value={rememberMinutes === null ? "logout" : String(rememberMinutes)}
          onChange={(v) => setRememberMinutes(v === "logout" ? null : Number(v))}
          options={REMEMBER_OPTIONS.map((opt) => ({ value: opt.minutes === null ? "logout" : String(opt.minutes), label: opt.label }))}
        />
      </div>
    </FormModal>
  );
}

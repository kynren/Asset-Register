import { FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { useAuth } from "../../auth/AuthContext";
import { PinCodeInput } from "../../components/PinCodeInput";

export function PinCard() {
  const { user, refreshSession } = useAuth();
  const [changing, setChanging] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const setMutation = useMutation({
    mutationFn: () => axiosClient.post("/auth/pin/set", { currentPassword, pin }),
    onSuccess: async () => {
      setChanging(false);
      setCurrentPassword("");
      setPin("");
      setConfirmPin("");
      setSuccess(true);
      await refreshSession();
    },
    onError: (err: any) => setError(err.response?.data?.error ?? "Could not set PIN."),
  });

  const removeMutation = useMutation({
    mutationFn: () => axiosClient.post("/auth/pin/remove", { currentPassword }),
    onSuccess: async () => {
      setChanging(false);
      setCurrentPassword("");
      await refreshSession();
    },
    onError: (err: any) => setError(err.response?.data?.error ?? "Could not remove PIN."),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (pin !== confirmPin) return setError("PIN and confirmation do not match.");
    setMutation.mutate();
  }

  return (
    <div className="card" style={{ maxWidth: 460, margin: "0 auto", textAlign: "center" }}>
      <h3 className="mt-0">Login PIN</h3>
      {success && <div className="alert alert-success">PIN updated successfully.</div>}
      {user?.pinEnabled && !changing ? (
        <>
          <div className="alert alert-success">A 6-digit PIN is enabled for signing in to your account.</div>
          <div className="row gap-2" style={{ justifyContent: "center" }}>
            <button className="btn btn-secondary" onClick={() => { setChanging(true); setError(null); }}>Change PIN</button>
            <button
              className="btn btn-danger"
              disabled={removeMutation.isPending}
              onClick={() => {
                const password = window.prompt("Enter your current password to remove your login PIN:");
                if (!password) return;
                setCurrentPassword(password);
                removeMutation.mutate();
              }}
            >
              {removeMutation.isPending ? "Removing..." : "Remove PIN"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted" style={{ fontSize: 12 }}>Set a 6-digit PIN as an alternative to your password for signing in.</p>
          {error && <div className="alert alert-danger">{error}</div>}
          <form onSubmit={handleSubmit} className="stack gap-3" style={{ alignItems: "center" }}>
            <div className="field" style={{ width: "100%", maxWidth: 260 }}>
              <label>Current Password</label>
              <input className="input" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
            </div>
            <div className="field" style={{ alignItems: "center" }}>
              <label>New PIN</label>
              <PinCodeInput length={6} value={pin} onChange={setPin} />
            </div>
            <div className="field" style={{ alignItems: "center" }}>
              <label>Confirm PIN</label>
              <PinCodeInput length={6} value={confirmPin} onChange={setConfirmPin} />
            </div>
            <div className="row gap-2" style={{ justifyContent: "center" }}>
              {changing && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setChanging(false); setError(null); }}>Cancel</button>
              )}
              <button className="btn btn-primary btn-sm" type="submit" disabled={pin.length !== 6 || setMutation.isPending}>
                {setMutation.isPending ? "Saving..." : "Set PIN"}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

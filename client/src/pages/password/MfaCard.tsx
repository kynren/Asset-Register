import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { useAuth } from "../../auth/AuthContext";

export function MfaCard() {
  const { user, refreshSession } = useAuth();
  const queryClient = useQueryClient();
  const [enrolling, setEnrolling] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const startMutation = useMutation({
    mutationFn: () => axiosClient.post("/auth/mfa/enroll/start"),
    onSuccess: (res) => {
      setQrDataUrl(res.data.qrDataUrl);
      setSecret(res.data.secret);
      setEnrolling(true);
      setError(null);
    },
  });

  const verifyMutation = useMutation({
    mutationFn: () => axiosClient.post("/auth/mfa/enroll/verify", { token: code }),
    onSuccess: async () => {
      setEnrolling(false);
      setQrDataUrl(null);
      setCode("");
      await refreshSession();
    },
    onError: (err: any) => setError(err.response?.data?.error ?? "Invalid code."),
  });

  const disableMutation = useMutation({
    mutationFn: () => axiosClient.post("/auth/mfa/disable"),
    onSuccess: async () => {
      await refreshSession();
      queryClient.invalidateQueries();
    },
  });

  return (
    <div className="card" style={{ maxWidth: 460 }}>
      <h3 className="mt-0">Two-Factor Authentication</h3>
      {user?.mfaEnabled ? (
        <>
          <div className="alert alert-success">Two-factor authentication is enabled on your account.</div>
          <button className="btn btn-danger" disabled={disableMutation.isPending} onClick={() => disableMutation.mutate()}>
            {disableMutation.isPending ? "Disabling..." : "Disable Two-Factor Authentication"}
          </button>
        </>
      ) : enrolling ? (
        <>
          {error && <div className="alert alert-danger">{error}</div>}
          <p className="muted" style={{ fontSize: 12 }}>Scan this QR code with an authenticator app (Google Authenticator, Authy, 1Password, etc.), then enter the 6-digit code it shows.</p>
          {qrDataUrl && <img src={qrDataUrl} alt="MFA QR code" style={{ width: 180, height: 180, margin: "0 auto", display: "block" }} />}
          <p className="muted" style={{ fontSize: 11, textAlign: "center", wordBreak: "break-all" }}>Manual entry key: {secret}</p>
          <div className="field">
            <label>6-Digit Code</label>
            <input className="input" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div className="row gap-2">
            <button className="btn btn-secondary" onClick={() => { setEnrolling(false); setQrDataUrl(null); }}>Cancel</button>
            <button className="btn btn-primary" disabled={code.length !== 6 || verifyMutation.isPending} onClick={() => verifyMutation.mutate()}>
              {verifyMutation.isPending ? "Verifying..." : "Verify & Enable"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted" style={{ fontSize: 12 }}>Add an extra layer of security by requiring a one-time code from an authenticator app at sign-in.</p>
          <button className="btn btn-primary" disabled={startMutation.isPending} onClick={() => startMutation.mutate()}>
            {startMutation.isPending ? "Starting..." : "Enable Two-Factor Authentication"}
          </button>
        </>
      )}
    </div>
  );
}

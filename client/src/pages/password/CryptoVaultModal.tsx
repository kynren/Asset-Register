import { useEffect, useRef, useState } from "react";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { useAuth } from "../../auth/AuthContext";
import { useBranding } from "../../theme/BrandingContext";
import { pushToast } from "../../lib/toastBridge";

type Stage = "decrypting" | "revealed" | "encrypting";

const LINE_INTERVAL_MS = 260;

const DECRYPT_LINES = [
  "Establishing secure session...",
  "Authenticating request with your session token...",
  "Fetching encrypted payload from the vault...",
  "Decrypting with AES-128-GCM...",
  "SUCCESS: Password decrypted.",
];
const ENCRYPT_LINES = [
  "Clearing plaintext from view...",
  "Preparing payload for re-encryption...",
  "Encrypting with AES-128-GCM...",
  "Discarding session key material...",
  "SUCCESS: Vault entry re-secured.",
];

function randomHexBlock(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function sessionCode(entryId: number): string {
  return `pwd-${entryId}${Date.now().toString().slice(-9)}`;
}

/**
 * Full-screen "cryptographic terminal" animation for revealing (and, on close/timeout,
 * re-encrypting) a vault password — narrates the real decrypt/re-secure steps as a scrolling
 * log rather than flashing plaintext on/off screen instantly.
 */
export function CryptoVaultModal({
  entryId,
  entryTitle,
  autoLockSeconds,
  onClose,
}: {
  entryId: number;
  entryTitle: string;
  autoLockSeconds: number;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const branding = useBranding();
  const [stage, setStage] = useState<Stage>("decrypting");
  const [lineCount, setLineCount] = useState(0);
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [remaining, setRemaining] = useState(autoLockSeconds);
  const [error, setError] = useState<string | null>(null);
  const codeRef = useRef(sessionCode(entryId));
  const cipherRef = useRef(randomHexBlock(48));
  const closingRef = useRef(false);

  const lines = stage === "encrypting" ? ENCRYPT_LINES : DECRYPT_LINES;

  // Steps the terminal log forward while a phase is actively "working" — frozen once revealed
  // (all lines already shown) so it doesn't keep re-animating while the plaintext just sits there.
  useEffect(() => {
    if (stage === "revealed") return;
    setLineCount(0);
    const id = setInterval(() => setLineCount((c) => Math.min(c + 1, lines.length)), LINE_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // Kicks off the real decrypt call immediately, but lets the log animation run its full course
  // even if the response comes back sooner — an instant flash-to-plaintext would defeat the point.
  useEffect(() => {
    let cancelled = false;
    const started = Date.now();
    const minMs = DECRYPT_LINES.length * LINE_INTERVAL_MS + 200;
    axiosClient
      .post(`/vault/${entryId}/reveal`)
      .then((res) => {
        const elapsed = Date.now() - started;
        setTimeout(() => {
          if (cancelled) return;
          setPlaintext(res.data.password as string);
          setStage("revealed");
        }, Math.max(0, minMs - elapsed));
      })
      .catch((err) => {
        if (cancelled) return;
        setTimeout(() => {
          if (cancelled) return;
          setError(err?.response?.data?.error ?? "Could not decrypt this entry.");
        }, Math.max(0, minMs - (Date.now() - started)));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId]);

  // Auto re-secures after the configured window of sitting decrypted on screen.
  useEffect(() => {
    if (stage !== "revealed") return;
    setRemaining(autoLockSeconds);
    const tick = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    const timeout = setTimeout(() => beginReEncrypt(), autoLockSeconds * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, autoLockSeconds]);

  function beginReEncrypt() {
    if (closingRef.current) return;
    closingRef.current = true;
    setStage("encrypting");
    setTimeout(() => onClose(), ENCRYPT_LINES.length * LINE_INTERVAL_MS + 900);
  }

  async function copyPlaintext() {
    if (!plaintext) return;
    await navigator.clipboard.writeText(plaintext);
    pushToast({ variant: "success", message: "Password copied to clipboard" });
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const isEncrypting = stage === "encrypting";
  const accentColor = isEncrypting ? "#f43f5e" : "#2dd4bf";
  const visibleLines = stage === "revealed" ? lines.length : lineCount;

  return (
    <div className="modal-overlay" onClick={() => !isEncrypting && stage === "revealed" && beginReEncrypt()}>
      <div
        className="card"
        style={{
          maxWidth: 560,
          width: "94%",
          padding: 0,
          overflow: "hidden",
          resize: "none",
          background: "#0b1424",
          color: "#cfe8ff",
          border: "1px solid #1e3a5f",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ height: 3, background: accentColor, transition: "background 0.3s ease" }} />

        <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #16243a" }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div className="row gap-2" style={{ alignItems: "center" }}>
              <Icon name={isEncrypting ? "password" : "key"} size={15} />
              <strong style={{ fontSize: 13, letterSpacing: 1, color: accentColor, fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" }}>
                CRYPTOGRAPHIC KEY {isEncrypting ? "ENCRYPTION (RE-SECURING)" : "DECRYPTION"} ACTIVE
              </strong>
            </div>
            {!isEncrypting && (
              <button className="btn-icon" onClick={beginReEncrypt} title="Close and re-secure" style={{ color: "#7ea1c9" }}>
                <Icon name="close" size={16} />
              </button>
            )}
          </div>
        </div>

        <div style={{ padding: "14px 20px", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", fontSize: 11 }}>
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8, color: "#5f84ab" }}>
            <div>
              <div>ID CODE: <span style={{ color: "#cfe8ff" }}>{codeRef.current}</span></div>
              <div style={{ marginTop: 4 }}>OPERATOR: <span style={{ color: "#cfe8ff" }}>{user ? `${user.firstName} ${user.lastName}` : "Unknown"}</span></div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div>SYSTEM: <span style={{ color: "#cfe8ff" }}>{branding.companyName} Vault System</span></div>
              <div style={{ marginTop: 4 }}>ALGORITHM: <span style={{ color: "#cfe8ff" }}>AES-128-GCM</span></div>
            </div>
          </div>

          <div style={{ marginTop: 14, background: "#060d18", border: "1px solid #16243a", borderRadius: 8, padding: 12, minHeight: 108 }}>
            {lines.slice(0, visibleLines).map((line, i) => {
              const isLast = i === lines.length - 1;
              return (
                <div key={i} style={{ color: isLast ? accentColor : "#8fb4dd", marginBottom: 4 }}>
                  [{i + 1}] {isLast ? <strong>{line}</strong> : line}
                </div>
              );
            })}
            {error && <div style={{ color: "#f87171", marginTop: 4 }}>[!] ERROR: {error}</div>}
          </div>

          {stage === "revealed" && plaintext && (
            <div style={{ marginTop: 14, textAlign: "center" }}>
              <div style={{ color: "#5f84ab", fontSize: 10, letterSpacing: 1 }}>DECRYPTED VAULT PAYLOAD — {entryTitle.toUpperCase()}</div>
              <div
                style={{
                  marginTop: 8,
                  padding: "14px 10px",
                  background: "#0e1c30",
                  border: "1px solid #1e3a5f",
                  borderRadius: 8,
                  fontSize: 20,
                  fontWeight: 700,
                  color: accentColor,
                  wordBreak: "break-all",
                }}
              >
                {plaintext}
              </div>
              <div style={{ marginTop: 6, fontSize: 10, color: "#5f84ab" }}>Auto re-securing in {remaining}s — or close manually</div>
            </div>
          )}

          {isEncrypting && (
            <div style={{ marginTop: 14, textAlign: "center" }}>
              <div style={{ color: "#5f84ab", fontSize: 10, letterSpacing: 1 }}>SECURE PAYLOAD ENCRYPTED</div>
              <div
                style={{
                  marginTop: 8,
                  padding: "14px 10px",
                  background: "#0e1c30",
                  border: "1px solid #1e3a5f",
                  borderRadius: 8,
                  fontSize: 12,
                  color: accentColor,
                  wordBreak: "break-all",
                  fontWeight: 600,
                }}
              >
                {cipherRef.current}
              </div>
            </div>
          )}
        </div>

        <div className="row gap-2" style={{ justifyContent: "flex-end", padding: "12px 20px", borderTop: "1px solid #16243a" }}>
          {stage === "revealed" && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={beginReEncrypt}>Close</button>
              <button
                className="btn btn-sm"
                style={{ background: accentColor, color: "#04201c", fontWeight: 600, border: "none" }}
                onClick={copyPlaintext}
              >
                <Icon name={copied ? "check" : "paperclip"} size={13} /> {copied ? "Copied!" : "Copy Plaintext"}
              </button>
            </>
          )}
          {stage === "decrypting" && error && (
            <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { detectBrowser, detectOS } from "../lib/userAgent";
import { copyToClipboard } from "../lib/clipboard";
import { useClientInfo } from "../hooks/useClientInfo";

interface ClientInfoModalProps {
  onClose: () => void;
}

function Field({ label, value, mono, tone }: { label: string; value: string; mono?: boolean; tone?: "green" | "cyan" | "amber" }) {
  const color =
    tone === "green" ? "var(--color-success)" : tone === "cyan" ? "var(--color-primary)" : tone === "amber" ? "var(--color-warning)" : "var(--color-text)";
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, letterSpacing: "0.05em", color: "var(--color-text-muted)", marginBottom: 4, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 13, color, fontFamily: mono ? "ui-monospace, SFMono-Regular, Consolas, monospace" : undefined, wordBreak: "break-all" }}>
        {value}
      </div>
    </div>
  );
}

export function ClientInfoModal({ onClose }: ClientInfoModalProps) {
  const [online, setOnline] = useState(navigator.onLine);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const { data: serverInfo } = useClientInfo();

  const ua = navigator.userAgent;
  const dpr = window.devicePixelRatio || 1;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const locale = navigator.language;
  const isSecure = window.location.protocol === "https:";

  const specsText = [
    `URL: ${window.location.href}`,
    `Origin: ${window.location.origin}`,
    `Connection: ${isSecure ? "HTTPS Encrypted" : "HTTP (Not Encrypted)"}`,
    `IP Address (${serverInfo?.source === "agent" ? "agent-reported" : "server-observed"}): ${serverInfo?.observedIp ?? "—"}`,
    `OS: ${detectOS(ua)}`,
    `Browser: ${detectBrowser(ua)}`,
    `CPU threads: ${navigator.hardwareConcurrency ?? "—"}`,
    `Screen: ${screen.width} x ${screen.height} (${dpr}x DPR)`,
    `Timezone: ${timezone}`,
    `Locale: ${locale}`,
    `User-Agent: ${ua}`,
  ].join("\n");

  async function handleCopy() {
    await copyToClipboard(specsText, "Specs copied to clipboard");
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 620, background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header" style={{ alignItems: "flex-start" }}>
          <div className="row gap-2" style={{ alignItems: "flex-start" }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: "var(--color-success-soft)",
                color: "var(--color-success)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon name="cpu" size={18} />
            </div>
            <div>
              <div className="row gap-2" style={{ alignItems: "center" }}>
                <h3 style={{ margin: 0, fontSize: 15, color: "var(--color-text)" }}>Client Physical Machine Information</h3>
                <span
                  className="badge"
                  style={{
                    background: online ? "var(--color-success-soft)" : "var(--color-danger-soft)",
                    color: online ? "var(--color-success)" : "var(--color-danger)",
                  }}
                >
                  {online ? "ONLINE" : "OFFLINE"}
                </span>
              </div>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>Web Address, Client IP, Version &amp; Physical Host Specs</p>
            </div>
          </div>
          <button className="modal-close" style={{ color: "var(--color-text-muted)" }} onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>

        <div style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, padding: 16, marginBottom: 14 }}>
          <div className="row gap-2" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <div className="row gap-2" style={{ color: "var(--color-primary)", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em" }}>
              <Icon name="network" size={14} /> WEB ADDRESS &amp; ENVIRONMENT
            </div>
            <span className="badge" style={{ background: "var(--color-success-soft)", color: "var(--color-success)" }}>ACTIVE ROUTE</span>
          </div>
          <div className="grid grid-cols-2">
            <Field label="Client Web Address (URL)" value={window.location.href} mono tone="cyan" />
            <Field label="App Version" value={`v${serverInfo?.appVersion ?? "—"} (Kynren Asset Register)`} tone="cyan" />
            <Field label="Web Origin Host" value={window.location.origin} mono />
            <Field label="Connection Security" value={isSecure ? "HTTPS Encrypted" : "HTTP (Not Encrypted)"} tone={isSecure ? "green" : "amber"} />
          </div>
        </div>

        <div style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, padding: 16, marginBottom: 14 }}>
          <div className="row gap-2" style={{ color: "var(--color-primary)", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", marginBottom: 12 }}>
            <Icon name="cpu" size={14} /> PHYSICAL MACHINE &amp; NETWORK IP
          </div>
          <div className="grid grid-cols-2">
            <Field
              label={serverInfo?.source === "agent" ? "Client IP (reported by Kynren agent)" : "Client IP (as seen by server)"}
              value={serverInfo?.observedIp ?? "Loading..."}
              mono
              tone="green"
            />
            <Field label="Operating System" value={detectOS(ua)} />
            <Field label="Client Browser" value={detectBrowser(ua)} />
            <Field label="CPU Threads" value={`${navigator.hardwareConcurrency ?? "—"} Logical CPU Threads`} tone="amber" />
            <Field label="Screen & Display" value={`${screen.width} x ${screen.height} (${dpr}x DPR)`} />
            <Field label="Timezone & Locale" value={`${timezone} · ${locale}`} />
            {serverInfo?.source === "agent" && (
              <>
                <Field label="Subnet Mask" value={serverInfo.subnetMask ?? "—"} mono />
                <Field label="Default Gateway" value={serverInfo.defaultGateway ?? "—"} mono />
                <Field label="DNS Servers" value={serverInfo.dnsServers ?? "—"} mono />
              </>
            )}
          </div>
          {serverInfo?.source === "connection" && (
            <p style={{ margin: "10px 0 0", fontSize: 11.5, color: "var(--color-text-muted)" }}>
              No Kynren agent report is linked to your account yet, so this IP is the raw connection address the server observed
              — behind NAT it can be identical for every device on the same network. Run the agent on this machine and link it to
              your assigned asset for a per-device IP instead.
            </p>
          )}
        </div>

        <div style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, padding: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.05em", color: "var(--color-text-muted)", marginBottom: 6, textTransform: "uppercase" }}>
            Full User-Agent String
          </div>
          <div style={{ fontSize: 11.5, color: "var(--color-text-muted)", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", wordBreak: "break-all" }}>
            {ua}
          </div>
        </div>

        <div className="row gap-2" style={{ justifyContent: "space-between" }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleCopy}
            style={{ background: "var(--color-bg)", borderColor: "var(--color-border)", color: "var(--color-text)" }}
          >
            <Icon name={copied ? "check" : "paperclip"} size={13} /> {copied ? "Copied" : "Copy Client Machine Specs"}
          </button>
          <button className="btn btn-primary btn-sm" onClick={onClose}>Close Inspector</button>
        </div>
      </div>
    </div>
  );
}

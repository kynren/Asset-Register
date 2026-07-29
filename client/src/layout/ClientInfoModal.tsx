import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../api/axiosClient";
import { Icon } from "../components/Icon";
import { detectBrowser, detectOS } from "../lib/userAgent";

interface ClientInfoModalProps {
  onClose: () => void;
}

function Field({ label, value, mono, tone }: { label: string; value: string; mono?: boolean; tone?: "green" | "cyan" | "amber" }) {
  const color = tone === "green" ? "#34d399" : tone === "cyan" ? "#22d3ee" : tone === "amber" ? "#fbbf24" : "#e6e9ef";
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, letterSpacing: "0.05em", color: "#7b8497", marginBottom: 4, textTransform: "uppercase" }}>{label}</div>
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

  const { data: serverInfo } = useQuery({
    queryKey: ["client-info"],
    queryFn: async () => (await axiosClient.get("/system/client-info")).data as { observedIp: string; protocol: string; host: string; appVersion: string },
  });

  const ua = navigator.userAgent;
  const dpr = window.devicePixelRatio || 1;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const locale = navigator.language;
  const isSecure = window.location.protocol === "https:";

  const specsText = [
    `URL: ${window.location.href}`,
    `Origin: ${window.location.origin}`,
    `Connection: ${isSecure ? "HTTPS Encrypted" : "HTTP (Not Encrypted)"}`,
    `Observed IP (server-side): ${serverInfo?.observedIp ?? "—"}`,
    `OS: ${detectOS(ua)}`,
    `Browser: ${detectBrowser(ua)}`,
    `CPU threads: ${navigator.hardwareConcurrency ?? "—"}`,
    `Screen: ${screen.width} x ${screen.height} (${dpr}x DPR)`,
    `Timezone: ${timezone}`,
    `Locale: ${locale}`,
    `User-Agent: ${ua}`,
  ].join("\n");

  async function handleCopy() {
    await navigator.clipboard.writeText(specsText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 620, background: "#0b1220", border: "1px solid #1c2536", color: "#e6e9ef" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header" style={{ alignItems: "flex-start" }}>
          <div className="row gap-2" style={{ alignItems: "flex-start" }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(52,211,153,0.15)", color: "#34d399", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon name="cpu" size={18} />
            </div>
            <div>
              <div className="row gap-2" style={{ alignItems: "center" }}>
                <h3 style={{ margin: 0, fontSize: 15, color: "#fff" }}>Client Physical Machine Information</h3>
                <span className="badge" style={{ background: online ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)", color: online ? "#34d399" : "#f87171" }}>
                  {online ? "ONLINE" : "OFFLINE"}
                </span>
              </div>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#7b8497" }}>Web Address, Client IP, Version &amp; Physical Host Specs</p>
            </div>
          </div>
          <button className="modal-close" style={{ color: "#7b8497" }} onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>

        <div style={{ background: "#111a2c", border: "1px solid #1c2536", borderRadius: 10, padding: 16, marginBottom: 14 }}>
          <div className="row gap-2" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <div className="row gap-2" style={{ color: "#7fb0ff", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em" }}>
              <Icon name="network" size={14} /> WEB ADDRESS &amp; ENVIRONMENT
            </div>
            <span className="badge" style={{ background: "rgba(52,211,153,0.15)", color: "#34d399" }}>ACTIVE ROUTE</span>
          </div>
          <div className="grid grid-cols-2">
            <Field label="Client Web Address (URL)" value={window.location.href} mono tone="cyan" />
            <Field label="App Version" value={`v${serverInfo?.appVersion ?? "—"} (Kynren Asset Register)`} tone="cyan" />
            <Field label="Web Origin Host" value={window.location.origin} mono />
            <Field label="Connection Security" value={isSecure ? "HTTPS Encrypted" : "HTTP (Not Encrypted)"} tone={isSecure ? "green" : "amber"} />
          </div>
        </div>

        <div style={{ background: "#111a2c", border: "1px solid #1c2536", borderRadius: 10, padding: 16, marginBottom: 14 }}>
          <div className="row gap-2" style={{ color: "#7fb0ff", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", marginBottom: 12 }}>
            <Icon name="cpu" size={14} /> PHYSICAL MACHINE &amp; NETWORK IP
          </div>
          <div className="grid grid-cols-2">
            <Field label="Client IP (as seen by server)" value={serverInfo?.observedIp ?? "Loading..."} mono tone="green" />
            <Field label="Operating System" value={detectOS(ua)} />
            <Field label="Client Browser" value={detectBrowser(ua)} />
            <Field label="CPU Threads" value={`${navigator.hardwareConcurrency ?? "—"} Logical CPU Threads`} tone="amber" />
            <Field label="Screen & Display" value={`${screen.width} x ${screen.height} (${dpr}x DPR)`} />
            <Field label="Timezone & Locale" value={`${timezone} · ${locale}`} />
          </div>
        </div>

        <div style={{ background: "#0d1420", border: "1px solid #1c2536", borderRadius: 10, padding: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.05em", color: "#7b8497", marginBottom: 6, textTransform: "uppercase" }}>Full User-Agent String</div>
          <div style={{ fontSize: 11.5, color: "#9aa4b8", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", wordBreak: "break-all" }}>{ua}</div>
        </div>

        <div className="row gap-2" style={{ justifyContent: "space-between" }}>
          <button className="btn btn-secondary btn-sm" onClick={handleCopy} style={{ background: "#131b2c", borderColor: "#1c2536", color: "#e6e9ef" }}>
            <Icon name={copied ? "check" : "paperclip"} size={13} /> {copied ? "Copied" : "Copy Client Machine Specs"}
          </button>
          <button className="btn btn-primary btn-sm" onClick={onClose}>Close Inspector</button>
        </div>
      </div>
    </div>
  );
}

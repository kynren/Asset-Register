import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Icon } from "./Icon";
import { ChipSelect } from "./ChipSelect";

export interface QrScannerSimulateOption {
  value: string;
  label: string;
}

interface QrScannerCoreProps {
  title: string;
  instructions: string;
  simulateLabel: string;
  simulateOptions: QrScannerSimulateOption[];
  notFoundMessage: (value: string) => string;
  // Return true once the value has been resolved and handled (e.g. navigated away, closed the
  // modal) — the scanner stops the camera. Return false to keep scanning and show a "not found"
  // message that clears itself after a couple seconds.
  onDecode: (value: string) => Promise<boolean>;
  onClose: () => void;
}

// Camera + jsQR decode loop extracted from the original Assets-only QrScannerModal so both Assets
// and Stock (and any future scan-driven flow) share the same lifecycle/permission handling instead
// of duplicating it.
export function QrScannerCore({ title, instructions, simulateLabel, simulateOptions, notFoundMessage, onDecode, onClose }: QrScannerCoreProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const resolvingRef = useRef(false);

  const [cameraStatus, setCameraStatus] = useState<"requesting" | "active" | "denied" | "unavailable">("requesting");
  const [status, setStatus] = useState<"pending" | "looking-up" | "not-found">("pending");
  const [errorValue, setErrorValue] = useState<string | null>(null);
  const [simulateValue, setSimulateValue] = useState("");

  function stopCamera() {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function resolveValue(value: string) {
    if (resolvingRef.current) return;
    resolvingRef.current = true;
    setStatus("looking-up");
    setErrorValue(null);
    const handled = await onDecode(value);
    if (handled) {
      stopCamera();
      return;
    }
    setStatus("not-found");
    setErrorValue(value);
    setTimeout(() => {
      resolvingRef.current = false;
      setStatus("pending");
    }, 2200);
  }

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraStatus("active");
        frameRef.current = requestAnimationFrame(tick);
      } catch (err) {
        setCameraStatus(err instanceof DOMException && err.name === "NotAllowedError" ? "denied" : "unavailable");
      }
    }

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA && !resolvingRef.current) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code && code.data) {
            resolveValue(code.data);
          }
        }
      }
      frameRef.current = requestAnimationFrame(tick);
    }

    start();
    return () => {
      cancelled = true;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSimulate(value: string) {
    setSimulateValue(value);
    if (value) resolveValue(value);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 760, background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)", display: "flex", gap: 20, padding: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ flex: 1, padding: 20 }}>
          <div className="row gap-2" style={{ justifyContent: "space-between", marginBottom: 14 }}>
            <div className="row gap-2" style={{ color: "var(--color-text)", fontWeight: 700, fontSize: 14 }}>
              <Icon name="grid" size={16} /> {title}
            </div>
            <button className="modal-close" style={{ color: "var(--color-text-muted)" }} onClick={onClose}><Icon name="close" size={18} /></button>
          </div>

          {/* Camera viewfinder is deliberately always black, like any camera UI, regardless of theme */}
          <div style={{ background: "#000", borderRadius: 8, overflow: "hidden", aspectRatio: "4/3", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
            <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: cameraStatus === "active" ? "block" : "none" }} />
            <canvas ref={canvasRef} style={{ display: "none" }} />
            {cameraStatus === "requesting" && <span style={{ color: "#9aa4b8", fontSize: 12 }}>Requesting camera access...</span>}
            {cameraStatus === "denied" && <span style={{ color: "var(--color-danger)", fontSize: 12, padding: 12, textAlign: "center" }}>Camera access denied. Use the simulate option below instead.</span>}
            {cameraStatus === "unavailable" && <span style={{ color: "var(--color-danger)", fontSize: 12, padding: 12, textAlign: "center" }}>No camera available. Use the simulate option below instead.</span>}
            {cameraStatus === "active" && status === "looking-up" && (
              <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12 }}>
                Looking up...
              </div>
            )}
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.05em", color: "var(--color-text-muted)", marginBottom: 6, textTransform: "uppercase" }}>{simulateLabel}</div>
            <ChipSelect
              style={{ background: "var(--color-bg)", borderColor: "var(--color-border)", color: "var(--color-text)" }}
              value={simulateValue}
              onChange={handleSimulate}
              placeholder={simulateOptions[0]?.label}
              options={simulateOptions}
            />
          </div>

          <div style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 8, padding: 12, marginTop: 14, fontSize: 12, color: "var(--color-text-muted)" }}>
            {instructions}
          </div>
        </div>

        <div style={{ width: 260, background: "var(--color-bg)", borderLeft: "1px solid var(--color-border)", padding: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          <Icon name="grid" size={36} />
          {status === "pending" && (
            <>
              <div style={{ marginTop: 10, fontWeight: 600, fontSize: 13, color: "var(--color-text)" }}>Scan Pending...</div>
              <div style={{ marginTop: 6, fontSize: 11, color: "var(--color-text-muted)" }}>Point the camera at a QR label, or simulate a scan from the panel on the left.</div>
            </>
          )}
          {status === "looking-up" && <div style={{ marginTop: 10, fontWeight: 600, fontSize: 13, color: "var(--color-text)" }}>Looking up...</div>}
          {status === "not-found" && (
            <>
              <div style={{ marginTop: 10, fontWeight: 600, fontSize: 13, color: "var(--color-danger)" }}>No match found</div>
              <div style={{ marginTop: 6, fontSize: 11, color: "var(--color-text-muted)" }}>{errorValue ? notFoundMessage(errorValue) : ""}</div>
            </>
          )}
          <div style={{ marginTop: "auto", paddingTop: 20, fontSize: 10, color: "var(--color-text-muted)", letterSpacing: "0.05em" }}>KYNREN SCANNING</div>
        </div>
      </div>
    </div>
  );
}

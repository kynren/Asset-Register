import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { ChipSelect } from "../../components/ChipSelect";

interface AssetOption {
  id: number;
  assetTag: string;
  name: string;
}

export function QrScannerModal({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const resolvingRef = useRef(false);
  const navigate = useNavigate();

  const [cameraStatus, setCameraStatus] = useState<"requesting" | "active" | "denied" | "unavailable">("requesting");
  const [status, setStatus] = useState<"pending" | "looking-up" | "not-found">("pending");
  const [errorTag, setErrorTag] = useState<string | null>(null);
  const [simulateValue, setSimulateValue] = useState("");

  const { data: assetOptions } = useQuery({
    queryKey: ["assets-for-scan"],
    queryFn: async () => (await axiosClient.get("/assets", { params: { pageSize: 200 } })).data.items as AssetOption[],
  });

  function stopCamera() {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function resolveTag(tag: string) {
    if (resolvingRef.current) return;
    resolvingRef.current = true;
    setStatus("looking-up");
    setErrorTag(null);
    try {
      const res = await axiosClient.get(`/assets/by-tag/${encodeURIComponent(tag)}`);
      stopCamera();
      onClose();
      navigate(`/assets/${res.data.id}`);
    } catch {
      setStatus("not-found");
      setErrorTag(tag);
      setTimeout(() => {
        resolvingRef.current = false;
        setStatus("pending");
      }, 2200);
    }
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
            resolveTag(code.data);
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

  function handleSimulate(tag: string) {
    setSimulateValue(tag);
    if (tag) resolveTag(tag);
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
              <Icon name="grid" size={16} /> ASSET QR SCANNER
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
                Looking up asset...
              </div>
            )}
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.05em", color: "var(--color-text-muted)", marginBottom: 6, textTransform: "uppercase" }}>Or simulate a scan</div>
            <ChipSelect
              style={{ background: "var(--color-bg)", borderColor: "var(--color-border)", color: "var(--color-text)" }}
              value={simulateValue}
              onChange={handleSimulate}
              placeholder="-- Select an asset to simulate scanning its label --"
              options={[
                { value: "", label: "-- Select an asset to simulate scanning its label --" },
                ...(assetOptions ?? []).map((a) => ({ value: a.assetTag, label: `${a.assetTag} — ${a.name}` })),
              ]}
            />
          </div>

          <div style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 8, padding: 12, marginTop: 14, fontSize: 12, color: "var(--color-text-muted)" }}>
            Hold an asset's printed QR label up to your camera, or pick one above to simulate a scan. A match opens that asset's detail page automatically.
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
              <div style={{ marginTop: 6, fontSize: 11, color: "var(--color-text-muted)" }}>No asset with tag "{errorTag}". Retrying scan...</div>
            </>
          )}
          <div style={{ marginTop: "auto", paddingTop: 20, fontSize: 10, color: "var(--color-text-muted)", letterSpacing: "0.05em" }}>KYNREN ASSET SCANNING</div>
        </div>
      </div>
    </div>
  );
}

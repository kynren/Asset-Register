import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";

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
        style={{ maxWidth: 760, background: "#0b1220", border: "1px solid #1c2536", color: "#e6e9ef", display: "flex", gap: 20, padding: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ flex: 1, padding: 20 }}>
          <div className="row gap-2" style={{ justifyContent: "space-between", marginBottom: 14 }}>
            <div className="row gap-2" style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>
              <Icon name="grid" size={16} /> ASSET QR SCANNER
            </div>
            <button className="modal-close" style={{ color: "#7b8497" }} onClick={onClose}><Icon name="close" size={18} /></button>
          </div>

          <div style={{ background: "#000", borderRadius: 8, overflow: "hidden", aspectRatio: "4/3", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
            <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: cameraStatus === "active" ? "block" : "none" }} />
            <canvas ref={canvasRef} style={{ display: "none" }} />
            {cameraStatus === "requesting" && <span style={{ color: "#7b8497", fontSize: 12 }}>Requesting camera access...</span>}
            {cameraStatus === "denied" && <span style={{ color: "#f87171", fontSize: 12, padding: 12, textAlign: "center" }}>Camera access denied. Use the simulate option below instead.</span>}
            {cameraStatus === "unavailable" && <span style={{ color: "#f87171", fontSize: 12, padding: 12, textAlign: "center" }}>No camera available. Use the simulate option below instead.</span>}
            {cameraStatus === "active" && status === "looking-up" && (
              <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12 }}>
                Looking up asset...
              </div>
            )}
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.05em", color: "#7b8497", marginBottom: 6, textTransform: "uppercase" }}>Or simulate a scan</div>
            <select
              className="select"
              style={{ background: "#131b2c", borderColor: "#1c2536", color: "#e6e9ef" }}
              value={simulateValue}
              onChange={(e) => handleSimulate(e.target.value)}
            >
              <option value="">-- Select an asset to simulate scanning its label --</option>
              {assetOptions?.map((a) => <option key={a.id} value={a.assetTag}>{a.assetTag} — {a.name}</option>)}
            </select>
          </div>

          <div style={{ background: "#111a2c", border: "1px solid #1c2536", borderRadius: 8, padding: 12, marginTop: 14, fontSize: 12, color: "#9aa4b8" }}>
            Hold an asset's printed QR label up to your camera, or pick one above to simulate a scan. A match opens that asset's detail page automatically.
          </div>
        </div>

        <div style={{ width: 260, background: "#080d17", borderLeft: "1px solid #1c2536", padding: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          <Icon name="grid" size={36} />
          {status === "pending" && (
            <>
              <div style={{ marginTop: 10, fontWeight: 600, fontSize: 13, color: "#fff" }}>Scan Pending...</div>
              <div style={{ marginTop: 6, fontSize: 11, color: "#7b8497" }}>Point the camera at a QR label, or simulate a scan from the panel on the left.</div>
            </>
          )}
          {status === "looking-up" && <div style={{ marginTop: 10, fontWeight: 600, fontSize: 13, color: "#fff" }}>Looking up...</div>}
          {status === "not-found" && (
            <>
              <div style={{ marginTop: 10, fontWeight: 600, fontSize: 13, color: "#f87171" }}>No match found</div>
              <div style={{ marginTop: 6, fontSize: 11, color: "#7b8497" }}>No asset with tag "{errorTag}". Retrying scan...</div>
            </>
          )}
          <div style={{ marginTop: "auto", paddingTop: 20, fontSize: 10, color: "#4b5568", letterSpacing: "0.05em" }}>KYNREN ASSET SCANNING</div>
        </div>
      </div>
    </div>
  );
}

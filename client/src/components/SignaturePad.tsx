import { useRef } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Icon } from "./Icon";

interface SignaturePadProps {
  onChange: (blob: Blob | null) => void;
}

// Drawn signature capture for stock issuance receipts — exports via canvas.toBlob() rather than
// base64 so the caller can attach it directly to a multipart upload instead of bloating a JSON body.
export function SignaturePad({ onChange }: SignaturePadProps) {
  const padRef = useRef<SignatureCanvas>(null);

  function handleEnd() {
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) {
      onChange(null);
      return;
    }
    const canvas = pad.getCanvas();
    canvas.toBlob((blob) => onChange(blob), "image/png");
  }

  function handleClear() {
    padRef.current?.clear();
    onChange(null);
  }

  return (
    <div>
      <div style={{ background: "#fff", border: "1px solid var(--color-border)", borderRadius: 8, touchAction: "none" }}>
        <SignatureCanvas
          ref={padRef}
          penColor="#101828"
          canvasProps={{ width: 460, height: 160, style: { width: "100%", height: 160, display: "block" } }}
          onEnd={handleEnd}
        />
      </div>
      <div className="row gap-2" style={{ marginTop: 6, justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={handleClear}>
          <Icon name="trash" size={12} /> Clear signature
        </button>
      </div>
    </div>
  );
}

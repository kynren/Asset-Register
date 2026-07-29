import { useEffect, useRef } from "react";
import QRCode from "qrcode";
import { FormModal } from "../../components/FormModal";

export function QrLabelModal({ assetTag, name, onClose }: { assetTag: string; name: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, assetTag, { width: 180, margin: 1 }).catch(() => undefined);
    }
  }, [assetTag]);

  function handlePrint() {
    window.print();
  }

  return (
    <FormModal title="Asset QR Label" onClose={onClose} hideFooter>
      <div id="qr-label-print" className="stack gap-2" style={{ alignItems: "center", textAlign: "center" }}>
        <canvas ref={canvasRef} />
        <strong>{assetTag}</strong>
        <span className="muted">{name}</span>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
        <button className="btn btn-primary" onClick={handlePrint}>Print Label</button>
      </div>
    </FormModal>
  );
}

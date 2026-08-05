import { useEffect, useRef } from "react";
import QRCode from "qrcode";
import { FormModal } from "./FormModal";

export function QrCodeModal({
  title,
  value,
  label,
  subLabel,
  footer,
  onClose,
}: {
  title: string;
  value: string;
  label: string;
  subLabel?: string;
  // Guaranteed to render at the very bottom of the printed label, below label/subLabel — use this
  // (rather than relying on subLabel ordering) when a value like a SKU must always be the last line.
  footer?: string;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, value, { width: 180, margin: 1 }).catch(() => undefined);
    }
  }, [value]);

  function handlePrint() {
    window.print();
  }

  return (
    <FormModal title={title} onClose={onClose} hideFooter>
      <div id="qr-label-print" className="stack gap-2" style={{ alignItems: "center", textAlign: "center" }}>
        <canvas ref={canvasRef} />
        <strong>{label}</strong>
        {subLabel && <span className="muted">{subLabel}</span>}
        {footer && <span className="muted" style={{ fontWeight: 600 }}>{footer}</span>}
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
        <button className="btn btn-primary" onClick={handlePrint}>Print Label</button>
      </div>
    </FormModal>
  );
}

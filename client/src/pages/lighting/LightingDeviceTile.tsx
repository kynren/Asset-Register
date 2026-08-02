import { useEffect, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { PermissionGate } from "../../auth/PermissionGate";
import { LightingDevice } from "./LightingDeviceCard";

const BULB_ON_COLOR = "#f2b705";

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

// Open ring (270°) with a 90° gap centered at the bottom — the "smart home tile" look from the
// reference image, not a percentage gauge: color alone (green vs. gray) carries the on/off state.
function describeRingArc(cx: number, cy: number, r: number) {
  const start = polarToCartesian(cx, cy, r, 495);
  const end = polarToCartesian(cx, cy, r, 225);
  return `M ${start.x} ${start.y} A ${r} ${r} 0 1 0 ${end.x} ${end.y}`;
}

// Tile-style device control matching the reference room-dashboard image: a 270° ring (green when
// on, gray when off) around a bulb icon that itself changes color with state, name below, and a
// kebab menu for edit/duplicate/delete instead of always-visible icon buttons.
export function LightingDeviceTile({
  device,
  onToggle,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  device: LightingDevice;
  onToggle: (on: boolean) => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const offline = device.status === "OFFLINE";
  const on = device.isOn;
  const size = 96;
  const r = size / 2 - 8;
  const ringColor = on ? "var(--color-success)" : "var(--color-border)";
  const dotPos = polarToCartesian(size / 2, size / 2, r, 225);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <div className="card" style={{ position: "relative", textAlign: "center", padding: "14px 10px 12px", opacity: offline ? 0.55 : 1 }}>
      <div className="row" style={{ position: "absolute", top: 8, right: 8 }} ref={menuRef}>
        <button className="btn-icon" title="Options" onClick={() => setMenuOpen((v) => !v)}>
          <Icon name="moreVertical" size={16} />
        </button>
        {menuOpen && (
          <div
            className="card"
            style={{ position: "absolute", top: 22, right: 0, zIndex: 5, padding: 4, minWidth: 130, boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}
          >
            <PermissionGate module="lighting" action="edit">
              <button className="btn btn-secondary btn-sm" style={{ width: "100%", justifyContent: "flex-start", marginBottom: 2 }} onClick={() => { setMenuOpen(false); onEdit(); }}>
                <Icon name="edit" size={12} /> Edit
              </button>
            </PermissionGate>
            <PermissionGate module="lighting" action="create">
              <button className="btn btn-secondary btn-sm" style={{ width: "100%", justifyContent: "flex-start", marginBottom: 2 }} onClick={() => { setMenuOpen(false); onDuplicate(); }}>
                <Icon name="paperclip" size={12} /> Duplicate
              </button>
            </PermissionGate>
            <PermissionGate module="lighting" action="delete">
              <button className="btn btn-danger btn-sm" style={{ width: "100%", justifyContent: "flex-start" }} onClick={() => { setMenuOpen(false); onDelete(); }}>
                <Icon name="trash" size={12} /> Remove
              </button>
            </PermissionGate>
          </div>
        )}
      </div>

      <button
        className="row"
        style={{ justifyContent: "center", width: "100%", cursor: offline ? "not-allowed" : "pointer", background: "none", border: "none", padding: 0 }}
        disabled={offline}
        onClick={() => onToggle(!on)}
        title={offline ? "Offline" : on ? "Turn off" : "Turn on"}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <path d={describeRingArc(size / 2, size / 2, r)} fill="none" stroke={ringColor} strokeWidth={4} strokeLinecap="round" style={{ transition: "stroke 0.2s ease" }} />
          <circle cx={dotPos.x} cy={dotPos.y} r={4} fill={ringColor} />
          <g transform={`translate(${size / 2 - 14}, ${size / 2 - 14})`} stroke={on ? BULB_ON_COLOR : "var(--color-text-muted)"} style={{ transition: "stroke 0.2s ease" }}>
            <svg width={28} height={28} viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7c.6.5 1 1.2 1 2.3h6c0-1.1.4-1.8 1-2.3A7 7 0 0012 2z" />
            </svg>
          </g>
        </svg>
      </button>

      <div style={{ fontSize: 13, color: "var(--color-text)", marginTop: 4 }}>{device.name}</div>
    </div>
  );
}

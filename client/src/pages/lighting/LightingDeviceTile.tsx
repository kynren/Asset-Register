import { useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import { Icon } from "../../components/Icon";
import { StatusBadge } from "../../components/StatusBadge";
import { PermissionGate } from "../../auth/PermissionGate";
import { LightingDevice } from "./LightingDeviceCard";

const BULB_ON_COLOR = "#f2b705";

const PROTOCOL_LABELS: Record<LightingDevice["protocol"], string> = {
  SHELLY: "Shelly",
  TASMOTA: "Tasmota",
  GENERIC_HTTP: "Generic HTTP",
  ZIGBEE: "ZigBee",
};

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
  onBrightnessCommit,
  detailed,
}: {
  device: LightingDevice;
  onToggle: (on: boolean) => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Only needed when `detailed` is true — the Devices tab's dimmable lights show a slider. */
  onBrightnessCommit?: (value: number) => void;
  /** Adds the protocol/IP/status/wattage line and brightness slider that the Devices tab needs,
   * on top of the same ring-tile visual the Dashboard uses — same design, no lost functionality. */
  detailed?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const offline = device.status === "OFFLINE";
  const on = device.isOn;
  const size = 96;
  const r = size / 2 - 8;
  const ringColor = on ? "var(--color-success)" : "var(--color-border)";
  const dotPos = polarToCartesian(size / 2, size / 2, r, 225);
  const isLight = device.kind === "LIGHT" && device.protocol !== "GENERIC_HTTP";

  // Fires a "pop + radiating ring" burst exactly once whenever isOn actually flips — whether from
  // this user's own click (once the mutation resolves and the prop updates) or from someone else
  // toggling it elsewhere — rather than on every re-render, so it reads as feedback for a state
  // change instead of a constant idle animation.
  const prevOnRef = useRef(on);
  const [justToggled, setJustToggled] = useState(false);
  useEffect(() => {
    if (prevOnRef.current !== on) {
      prevOnRef.current = on;
      setJustToggled(true);
      const t = setTimeout(() => setJustToggled(false), 550);
      return () => clearTimeout(t);
    }
  }, [on]);

  // Local draft value while dragging the slider — only committed (network call) on release, same
  // pattern LightingDeviceCard used, so sweeping the range doesn't fire dozens of requests.
  const [liveBrightness, setLiveBrightness] = useState(device.brightness ?? 0);
  useEffect(() => setLiveBrightness(device.brightness ?? 0), [device.brightness]);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <div className="card" style={{ position: "relative", textAlign: "center", padding: "14px 10px 12px", opacity: offline ? 0.55 : 1, resize: "none", overflow: "visible" }}>
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
            <PermissionGate module="lighting" action="duplicate">
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
        className={`row${justToggled ? " device-toggle-pop" : ""}`}
        style={{ justifyContent: "center", width: "100%", cursor: offline ? "not-allowed" : "pointer", background: "none", border: "none", padding: 0, position: "relative" }}
        disabled={offline}
        onClick={() => onToggle(!on)}
        title={offline ? "Offline" : on ? "Turn off" : "Turn on"}
      >
        {justToggled && (
          <span
            className="device-toggle-ring"
            style={{
              position: "absolute", top: "50%", left: "50%", width: size, height: size, marginTop: -size / 2, marginLeft: -size / 2,
              borderRadius: "50%", border: `2px solid ${ringColor}`, pointerEvents: "none",
            }}
          />
        )}
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <path d={describeRingArc(size / 2, size / 2, r)} fill="none" stroke={ringColor} strokeWidth={4} strokeLinecap="round" style={{ transition: "stroke 0.3s ease", filter: on ? `drop-shadow(0 0 3px ${ringColor})` : undefined }} />
          <circle cx={dotPos.x} cy={dotPos.y} r={4} fill={ringColor} />
          <g
            transform={`translate(${size / 2 - 14}, ${size / 2 - 14})`}
            stroke={on ? BULB_ON_COLOR : "var(--color-text-muted)"}
            style={{ transition: "stroke 0.3s ease, filter 0.3s ease", filter: on ? `drop-shadow(0 0 4px ${BULB_ON_COLOR})` : undefined }}
          >
            <svg width={28} height={28} viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7c.6.5 1 1.2 1 2.3h6c0-1.1.4-1.8 1-2.3A7 7 0 0012 2z" />
            </svg>
          </g>
        </svg>
      </button>

      <div style={{ fontSize: 13, color: "var(--color-text)", marginTop: 4 }}>{device.name}</div>

      {detailed && (
        <div style={{ marginTop: 8, textAlign: "left" }}>
          <div className="muted" style={{ fontSize: 11, lineHeight: 1.5 }}>
            {PROTOCOL_LABELS[device.protocol]}
            {device.ipAddress && ` · ${device.ipAddress}${device.port ? `:${device.port}` : ""}`}
            {device.protocol === "SHELLY" && ` · ${device.gen ? `Gen ${device.gen}` : "?"}`}
            {device.location && ` · ${device.location.name}`}
          </div>
          <div className="row gap-2" style={{ marginTop: 4, alignItems: "center" }}>
            <StatusBadge status={device.status} />
            {device.powerW !== null && <span className="muted" style={{ fontSize: 11 }}>{device.powerW.toFixed(1)} W</span>}
            {device.lastCheckedAt && (
              <span className="muted" style={{ fontSize: 10, marginLeft: "auto" }}>
                checked {dayjs(device.lastCheckedAt).format("HH:mm:ss")}
              </span>
            )}
          </div>

          {isLight && (
            <div style={{ marginTop: 8 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="muted" style={{ fontSize: 11 }}>Brightness</span>
                <span className="muted" style={{ fontSize: 11 }}>{liveBrightness}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={liveBrightness}
                disabled={offline}
                onChange={(e) => setLiveBrightness(Number(e.target.value))}
                onMouseUp={(e) => onBrightnessCommit?.(Number((e.target as HTMLInputElement).value))}
                onTouchEnd={(e) => onBrightnessCommit?.(Number((e.target as HTMLInputElement).value))}
                style={{ width: "100%", accentColor: "var(--color-primary)", marginTop: 4 }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

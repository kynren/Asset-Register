import { useState } from "react";
import { FormModal } from "../../components/FormModal";
import { Icon } from "../../components/Icon";
import { SiteMapPlacement, SiteMapShapeType } from "./siteMapTypes";

const ICON_CHOICES = ["bulb", "home", "layers", "cpu", "star", "diamond", "sun", "moon", "wifi", "plug", "gauge", "camera", "mapPin", "grid"];

interface Props {
  placement: SiteMapPlacement;
  onClose: () => void;
  onSave: (patch: { onIcon?: string | null; offIcon?: string | null; onColor?: string | null; offColor?: string | null; zoneOnColor?: string | null }) => void;
  onClearShape: () => void;
  onStartDrawing: (shapeType: Exclude<SiteMapShapeType, "NONE">) => void;
  onDelete: () => void;
  saving?: boolean;
}

export function SiteMapDevicePanel({ placement, onClose, onSave, onClearShape, onStartDrawing, onDelete, saving }: Props) {
  const [onIcon, setOnIcon] = useState(placement.onIcon ?? "bulb");
  const [offIcon, setOffIcon] = useState(placement.offIcon ?? "bulb");
  const [onColor, setOnColor] = useState(placement.onColor ?? "#f2b705");
  const [offColor, setOffColor] = useState(placement.offColor ?? "#8a8f98");
  const [zoneOnColor, setZoneOnColor] = useState(placement.zoneOnColor ?? "#f2b705");

  function handleSave() {
    onSave({ onIcon, offIcon, onColor, offColor, zoneOnColor });
  }

  return (
    <FormModal title={placement.device.name} onClose={onClose} onSubmit={handleSave} submitting={saving} submitLabel="Save">
      <div className="stack gap-3">
        <div>
          <label style={{ fontSize: 12, fontWeight: 600 }}>When On</label>
          <div className="row gap-2" style={{ marginTop: 6, alignItems: "center" }}>
            <input type="color" className="input" value={onColor} onChange={(e) => setOnColor(e.target.value)} style={{ width: 44, height: 32, padding: 2 }} />
            <div className="row gap-1 flex-wrap" style={{ flex: 1 }}>
              {ICON_CHOICES.map((name) => (
                <button
                  key={name}
                  className="btn-icon"
                  style={{ width: 30, height: 30, border: onIcon === name ? "2px solid var(--color-primary)" : undefined }}
                  onClick={() => setOnIcon(name)}
                  title={name}
                >
                  <Icon name={name} size={14} />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 600 }}>When Off</label>
          <div className="row gap-2" style={{ marginTop: 6, alignItems: "center" }}>
            <input type="color" className="input" value={offColor} onChange={(e) => setOffColor(e.target.value)} style={{ width: 44, height: 32, padding: 2 }} />
            <div className="row gap-1 flex-wrap" style={{ flex: 1 }}>
              {ICON_CHOICES.map((name) => (
                <button
                  key={name}
                  className="btn-icon"
                  style={{ width: 30, height: 30, border: offIcon === name ? "2px solid var(--color-primary)" : undefined }}
                  onClick={() => setOffIcon(name)}
                  title={name}
                >
                  <Icon name={name} size={14} />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Coverage Zone Color (when On)</label>
          <div className="row gap-2" style={{ marginTop: 6, alignItems: "center" }}>
            <input type="color" className="input" value={zoneOnColor} onChange={(e) => setZoneOnColor(e.target.value)} style={{ width: 44, height: 32, padding: 2 }} />
            <span className="muted" style={{ fontSize: 11 }}>Dimmed automatically when the light is off.</span>
          </div>
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Coverage Shape</label>
          <div className="muted" style={{ fontSize: 11, margin: "2px 0 6px" }}>
            {placement.shapeType === "NONE" ? "No shape drawn yet." : `Current shape: ${placement.shapeType.toLowerCase()}.`}
          </div>
          <div className="row gap-2 flex-wrap">
            <button className="btn btn-secondary btn-sm" onClick={() => onStartDrawing("CIRCLE")}>Draw Circle</button>
            <button className="btn btn-secondary btn-sm" onClick={() => onStartDrawing("POLYGON")}>Draw Zone</button>
            <button className="btn btn-secondary btn-sm" onClick={() => onStartDrawing("PATH")}>Draw Path</button>
            {placement.shapeType !== "NONE" && (
              <button className="btn btn-secondary btn-sm" onClick={onClearShape}>Clear Shape</button>
            )}
          </div>
        </div>

        <button className="btn btn-danger btn-sm" style={{ alignSelf: "flex-start" }} onClick={onDelete}>
          <Icon name="trash" size={12} /> Remove From Map
        </button>
      </div>
    </FormModal>
  );
}

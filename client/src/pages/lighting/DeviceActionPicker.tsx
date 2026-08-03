import { LightingDevice } from "./LightingDeviceCard";
import { ChipSelect } from "../../components/ChipSelect";

export interface DraftAction {
  turnOn: boolean;
  brightness: number | null;
}

export interface DeviceAction {
  deviceId: number;
  turnOn: boolean;
  brightness: number | null;
}

export function draftsToActions(drafts: Map<number, DraftAction>): DeviceAction[] {
  return [...drafts.entries()].map(([deviceId, a]) => ({ deviceId, turnOn: a.turnOn, brightness: a.brightness }));
}

export function actionsToDrafts(actions: DeviceAction[]): Map<number, DraftAction> {
  return new Map(actions.map((a) => [a.deviceId, { turnOn: a.turnOn, brightness: a.brightness }]));
}

// Multi-device on/off (+ brightness for dimmable lights) picker, shared by Scenes and DEVICE-type
// Automations — both apply the same set-of-device-actions shape.
export function DeviceActionPicker({
  devices,
  drafts,
  onChange,
}: {
  devices: LightingDevice[];
  drafts: Map<number, DraftAction>;
  onChange: (next: Map<number, DraftAction>) => void;
}) {
  function toggleIncluded(deviceId: number, on: boolean, kind: "SWITCH" | "LIGHT" | null) {
    const next = new Map(drafts);
    if (on) next.set(deviceId, { turnOn: true, brightness: kind === "LIGHT" ? 100 : null });
    else next.delete(deviceId);
    onChange(next);
  }
  function updateAction(deviceId: number, patch: Partial<DraftAction>) {
    const next = new Map(drafts);
    const existing = next.get(deviceId);
    if (existing) next.set(deviceId, { ...existing, ...patch });
    onChange(next);
  }

  return (
    <div className="field">
      <label>Devices ({drafts.size} included)</label>
      <div className="stack gap-2" style={{ maxHeight: 320, overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: 8, padding: 10 }}>
        {devices.length === 0 && <p className="muted" style={{ fontSize: 12 }}>No devices yet.</p>}
        {devices.map((d) => {
          const draft = drafts.get(d.id);
          const included = draft !== undefined;
          return (
            <div key={d.id} className="stack gap-1">
              <label className="row gap-2" style={{ fontSize: 13, cursor: "pointer", alignItems: "center" }}>
                <input type="checkbox" checked={included} onChange={(e) => toggleIncluded(d.id, e.target.checked, d.kind)} />
                {d.name}
              </label>
              {included && (
                <div className="row gap-2" style={{ marginLeft: 24, alignItems: "center" }}>
                  <ChipSelect
                    style={{ width: "auto", fontSize: 12 }}
                    value={draft!.turnOn ? "on" : "off"}
                    onChange={(v) => updateAction(d.id, { turnOn: v === "on" })}
                    options={[
                      { value: "on", label: "Turn On" },
                      { value: "off", label: "Turn Off" },
                    ]}
                  />
                  {d.kind === "LIGHT" && draft!.turnOn && (
                    <>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={draft!.brightness ?? 100}
                        onChange={(e) => updateAction(d.id, { brightness: Number(e.target.value) })}
                        style={{ width: 100 }}
                      />
                      <span className="muted" style={{ fontSize: 11 }}>{draft!.brightness ?? 100}%</span>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

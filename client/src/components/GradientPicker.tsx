export interface GradientValue {
  from: string;
  to: string;
  angle: number;
}

interface GradientPickerProps {
  value: GradientValue;
  onChange: (value: GradientValue) => void;
}

export function gradientCss({ from, to, angle }: GradientValue): string {
  return `linear-gradient(${angle}deg, ${from}, ${to})`;
}

export function GradientPicker({ value, onChange }: GradientPickerProps) {
  return (
    <div className="stack gap-2">
      <div style={{ height: 48, borderRadius: 8, background: gradientCss(value), border: "1px solid var(--color-border)" }} />
      <div className="row gap-2" style={{ alignItems: "flex-end" }}>
        <div className="field" style={{ flex: 1 }}>
          <label>From</label>
          <input className="input" type="color" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} style={{ height: 36, padding: 2 }} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>To</label>
          <input className="input" type="color" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} style={{ height: 36, padding: 2 }} />
        </div>
        <div className="field" style={{ flex: 2 }}>
          <label>Angle ({value.angle}°)</label>
          <input
            type="range"
            min={0}
            max={360}
            value={value.angle}
            onChange={(e) => onChange({ ...value, angle: Number(e.target.value) })}
            style={{ width: "100%" }}
          />
        </div>
      </div>
    </div>
  );
}

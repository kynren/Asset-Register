import { ACCENT_PALETTE } from "../../lib/color";
import { Icon } from "../../components/Icon";

export function ColorPaletteCard({ selected, onSelect }: { selected: string | null; onSelect: (color: string | null) => void }) {
  return (
    <div>
      <div className="row gap-2 flex-wrap">
        {ACCENT_PALETTE.map((color) => (
          <button
            key={color}
            onClick={() => onSelect(color)}
            title={color}
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: color,
              border: selected === color ? "3px solid var(--color-text)" : "2px solid var(--color-border)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {selected === color && <Icon name="check" size={14} />}
          </button>
        ))}
        <button
          onClick={() => onSelect(null)}
          title="Reset to default"
          className="btn btn-secondary btn-sm"
          style={{ borderRadius: 999 }}
        >
          Reset
        </button>
      </div>
      <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>Personalize your accent color across the app.</p>
    </div>
  );
}

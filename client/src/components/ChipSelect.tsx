import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";

export interface ChipSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

// Drop-in replacement for a native single-select <select className="select">: closed it looks like
// the same button-styled field, but clicking it opens a small popover with a search box (shown once
// there are enough options to be worth filtering) and every option rendered as a clickable chip.
// value/onChange are plain strings (no synthetic event), since there's no real <select> underneath.
export function ChipSelect({
  value,
  onChange,
  options,
  placeholder = "Select...",
  disabled,
  className,
  style,
  searchPlaceholder = "Search...",
  searchThreshold = 8,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ChipSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  searchPlaceholder?: string;
  searchThreshold?: number;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  return (
    <div ref={rootRef} className={className} style={{ position: "relative", ...style }}>
      <button
        type="button"
        className="select"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, textAlign: "left", cursor: disabled ? "not-allowed" : "pointer" }}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: selected ? "inherit" : "var(--color-text-muted)" }}>
          {selected ? selected.label : placeholder}
        </span>
        <Icon name="chevronDown" size={13} />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 50,
            minWidth: "100%",
            width: "max-content",
            maxWidth: 320,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,0.14)",
            padding: 8,
          }}
        >
          {options.length > searchThreshold && (
            <input
              autoFocus
              className="input"
              style={{ marginBottom: 8 }}
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 220, overflowY: "auto" }}>
            {filtered.length === 0 && <div className="muted" style={{ fontSize: 12, padding: "4px 2px" }}>No matches.</div>}
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                disabled={o.disabled}
                className={`badge ${o.value === value ? "badge-primary" : "badge-neutral"}`}
                style={{ cursor: o.disabled ? "not-allowed" : "pointer", border: "none", fontSize: 12.5, padding: "5px 10px" }}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                  setSearch("");
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

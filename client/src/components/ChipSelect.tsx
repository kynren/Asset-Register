import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

export interface ChipSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface ChipSelectBaseProps {
  options: ChipSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  searchPlaceholder?: string;
  searchThreshold?: number;
}

interface ChipSelectSingleProps extends ChipSelectBaseProps {
  multiple?: false;
  value: string;
  onChange: (value: string) => void;
}

interface ChipSelectMultiProps extends ChipSelectBaseProps {
  multiple: true;
  value: string[];
  onChange: (value: string[]) => void;
}

// Drop-in replacement for a native single-select <select className="select">: closed it looks like
// the same button-styled field, but clicking it opens a small popover with a search box (shown once
// there are enough options to be worth filtering) and every option rendered as a clickable chip.
// value/onChange are plain strings (no synthetic event), since there's no real <select> underneath.
// multiple:true switches value/onChange to string[] (see overloads below) — used for "match any of"
// filters (e.g. Report Builder's "in" operator) that previously fell back to a raw native
// <select multiple>; picking an option toggles it and keeps the popover open instead of closing.
export function ChipSelect(props: ChipSelectSingleProps): JSX.Element;
export function ChipSelect(props: ChipSelectMultiProps): JSX.Element;
export function ChipSelect(props: ChipSelectSingleProps | ChipSelectMultiProps) {
  const {
    value,
    onChange,
    options,
    placeholder = "Select...",
    disabled,
    className,
    style,
    searchPlaceholder = "Search...",
    searchThreshold = 8,
    multiple,
  } = props;

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number; width: number; openUpward: boolean } | null>(null);

  function close() {
    setOpen(false);
    setSearch("");
  }

  // Popover is portaled to document.body (see render below) so it can't be clipped by any
  // scrollable/overflow-hidden ancestor (.card, .modal, .page-content, etc.) — position is
  // computed from the trigger's viewport rect since the popover is no longer a DOM descendant
  // of rootRef and can't rely on CSS `position: absolute` relative to it anymore.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const estimatedHeight = 260; // rough popover height (search box + wrapped chips, maxHeight 220 + padding)
    const openUpward = window.innerHeight - rect.bottom < estimatedHeight && rect.top > estimatedHeight;
    setPopoverPos({
      top: openUpward ? rect.top - 4 : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      openUpward,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      close();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    // Short-lived selection UI — rather than continuously repositioning the portaled popover on
    // every scroll of every ancestor, just close it (same simplification as outside-click/Escape).
    // Scroll events from inside the popover's own option list (its internal overflow-y:auto) are
    // ignored, or the popover would close the instant someone tries to scroll through options.
    function onScrollOrResize(e: Event) {
      if (popoverRef.current?.contains(e.target as Node)) return;
      close();
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open]);

  const selectedValues = multiple ? value : undefined;
  const selected = !multiple ? options.find((o) => o.value === value) : undefined;
  const isSelected = (v: string) => (multiple ? selectedValues!.includes(v) : v === value);

  const triggerLabel = multiple
    ? selectedValues!.length === 0
      ? placeholder
      : selectedValues!.length === 1
        ? options.find((o) => o.value === selectedValues![0])?.label ?? selectedValues![0]
        : `${selectedValues!.length} selected`
    : selected
      ? selected.label
      : placeholder;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  function handlePick(v: string) {
    if (multiple) {
      const next = selectedValues!.includes(v) ? selectedValues!.filter((x) => x !== v) : [...selectedValues!, v];
      (onChange as (value: string[]) => void)(next);
      // multi-select stays open so the user can toggle several options in one interaction
      return;
    }
    (onChange as (value: string) => void)(v);
    close();
  }

  return (
    <div ref={rootRef} className={className} style={{ position: "relative", ...style }}>
      <button
        ref={triggerRef}
        type="button"
        className="select"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, textAlign: "left", cursor: disabled ? "not-allowed" : "pointer" }}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: (multiple ? selectedValues!.length > 0 : !!selected) ? "inherit" : "var(--color-text-muted)" }}>
          {triggerLabel}
        </span>
        <Icon name="chevronDown" size={13} />
      </button>

      {open && popoverPos &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: "fixed",
              top: popoverPos.top,
              left: popoverPos.left,
              transform: popoverPos.openUpward ? "translateY(-100%)" : undefined,
              // z-200: a portaled node is a sibling of .modal-overlay (z-[100]) in the DOM, not a
              // nested descendant, so it must out-rank the overlay to stay visible when a
              // ChipSelect trigger lives inside a modal.
              zIndex: 200,
              minWidth: popoverPos.width,
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
                  className={`badge ${isSelected(o.value) ? "badge-primary" : "badge-neutral"}`}
                  style={{ cursor: o.disabled ? "not-allowed" : "pointer", border: "none", fontSize: 12.5, padding: "5px 10px" }}
                  onClick={() => handlePick(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {multiple && (
              <div className="row gap-2" style={{ justifyContent: "flex-end", marginTop: 8 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={close}>Done</button>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}

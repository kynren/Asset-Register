import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "../../components/Icon";

export interface CategoryTab {
  name: string; // "" represents "All Categories"
  count: number;
}

interface CategoryTabBarProps {
  categories: CategoryTab[];
  active: string;
  onSelect: (category: string) => void;
  /** Overrides the synthetic "All" tab's count, which otherwise defaults to summing every
   * child's count (e.g. total documents/assets across categories). Pass this when "All" should
   * instead read as a count of the categories themselves (e.g. Asset Inventory's Collections bar
   * showing "3" for three collections, not the sum of assets inside them). */
  allCount?: number;
}

const MORE_BUTTON_WIDTH = 92;
const TAB_GAP = 6;

// A horizontal tab bar that only shows as many category tabs as fit the available width — the
// rest collapse into a "More" popover instead of wrapping or scrolling, so the bar always reads
// as a single row no matter how many categories a tenant has accumulated. Widths are measured
// from an off-screen mirror row (rendered once, always fully populated) since the visible row's
// own tab count is exactly what we're trying to compute — measuring it directly would be circular.
export function CategoryTabBar({ categories, active, onSelect, allCount }: CategoryTabBarProps) {
  const allTabs: CategoryTab[] = [{ name: "", count: allCount ?? categories.reduce((sum, c) => sum + c.count, 0) }, ...categories];

  const wrapRef = useRef<HTMLDivElement>(null);
  const measureRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [visibleCount, setVisibleCount] = useState(allTabs.length);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    function measure() {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const available = wrap.clientWidth;
      let used = 0;
      let count = 0;
      for (const tab of allTabs) {
        const el = measureRefs.current.get(tab.name);
        const width = (el?.offsetWidth ?? 0) + TAB_GAP;
        const needsReserve = count + 1 < allTabs.length;
        const budget = available - (needsReserve ? MORE_BUTTON_WIDTH : 0);
        if (used + width > budget && count > 0) break;
        used += width;
        count++;
      }
      setVisibleCount(Math.max(1, count));
    }
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories.map((c) => `${c.name}:${c.count}`).join(",")]);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  const visible = allTabs.slice(0, visibleCount);
  const overflow = allTabs.slice(visibleCount);
  const overflowHasActive = overflow.some((t) => t.name === active);

  return (
    <div className="docs-category-bar" ref={wrapRef}>
      <div className="docs-category-bar-measure" aria-hidden="true">
        {allTabs.map((tab) => (
          <button
            key={tab.name || "all"}
            ref={(el) => {
              if (el) measureRefs.current.set(tab.name, el);
            }}
            className="docs-category-tab"
            tabIndex={-1}
          >
            {tab.name || "All Categories"}
            <span className="docs-category-tab-count">{tab.count}</span>
          </button>
        ))}
      </div>

      <div className="docs-category-bar-track">
        {visible.map((tab) => (
          <button
            key={tab.name || "all"}
            className={`docs-category-tab ${active === tab.name ? "active" : ""}`}
            onClick={() => onSelect(tab.name)}
          >
            {tab.name || "All Categories"}
            <span className="docs-category-tab-count">{tab.count}</span>
          </button>
        ))}

        {overflow.length > 0 && (
          <div className="docs-category-more" ref={moreRef}>
            <button
              className={`docs-category-tab docs-category-more-btn ${overflowHasActive ? "active" : ""}`}
              onClick={() => setMoreOpen((v) => !v)}
            >
              More <Icon name="chevronDown" size={13} />
            </button>
            {moreOpen && (
              <div className="docs-category-more-menu">
                {overflow.map((tab) => (
                  <button
                    key={tab.name}
                    className={`docs-category-more-item ${active === tab.name ? "active" : ""}`}
                    onClick={() => {
                      onSelect(tab.name);
                      setMoreOpen(false);
                    }}
                  >
                    <span>{tab.name}</span>
                    <span className="docs-category-tab-count">{tab.count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

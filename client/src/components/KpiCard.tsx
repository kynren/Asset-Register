import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "./Icon";
import { useCountUp } from "../hooks/useCountUp";

interface KpiCardProps {
  label: string;
  value: ReactNode;
  icon?: string;
  tone?: "primary" | "success" | "warning" | "danger" | "neutral";
  live?: boolean;
  /** Route to the module this KPI summarizes — renders a "View all" link in the card footer.
   * Omit on cards already embedded in that module's own dashboard. */
  linkTo?: string;
}

const toneColors: Record<string, string> = {
  primary: "var(--color-primary)",
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
  neutral: "var(--color-text-muted)",
};

// Written out as full literal class names (not built via template string) so Tailwind's static
// content scanner can find them — a `kpi-card-${tone}` interpolation never appears verbatim in
// this file, so the JIT tree-shaker would silently drop those @layer components rules entirely.
const toneCardClass: Record<string, string> = {
  primary: "kpi-card-primary",
  success: "kpi-card-success",
  warning: "kpi-card-warning",
  danger: "kpi-card-danger",
  neutral: "kpi-card-neutral",
};

export function KpiCard({ label, value, icon, tone = "primary", live = false, linkTo }: KpiCardProps) {
  const numericTarget = typeof value === "number" ? value : null;
  const animated = useCountUp(numericTarget);
  const displayValue = numericTarget !== null ? animated.toLocaleString() : value;

  return (
    <div className={`kpi-card ${toneCardClass[tone]}`}>
      <div className="row gap-2" style={{ justifyContent: "space-between" }}>
        <span className="kpi-label">{label}</span>
        {live && <span className="live-dot" title="Live" />}
      </div>
      <span className="kpi-value">{displayValue}</span>
      <div className="kpi-footer">
        {linkTo ? (
          <Link to={linkTo} className="kpi-view-all">
            View all <Icon name="arrowRight" size={12} />
          </Link>
        ) : (
          <span />
        )}
        {icon && (
          <span
            className="kpi-icon-badge"
            style={
              tone === "neutral"
                ? { background: toneColors[tone] }
                : { background: "rgba(255, 255, 255, 0.18)", color: "#fff" }
            }
          >
            <Icon name={icon} size={18} />
          </span>
        )}
      </div>
    </div>
  );
}

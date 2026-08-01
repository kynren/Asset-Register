import { ReactNode } from "react";
import { Icon } from "./Icon";
import { useCountUp } from "../hooks/useCountUp";

interface KpiCardProps {
  label: string;
  value: ReactNode;
  icon?: string;
  tone?: "primary" | "success" | "warning" | "danger" | "neutral";
  live?: boolean;
}

const toneColors: Record<string, string> = {
  primary: "var(--color-primary)",
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
  neutral: "var(--color-text-muted)",
};

export function KpiCard({ label, value, icon, tone = "primary", live = false }: KpiCardProps) {
  const numericTarget = typeof value === "number" ? value : null;
  const animated = useCountUp(numericTarget);
  const displayValue = numericTarget !== null ? animated.toLocaleString() : value;

  return (
    <div className="kpi-card">
      <div className="row gap-2" style={{ justifyContent: "space-between" }}>
        <span className="kpi-label">{label}</span>
        <div className="row gap-2">
          {live && <span className="live-dot" title="Live" />}
          {icon && (
            <span className="kpi-icon-glow" style={{ color: toneColors[tone] }}>
              <Icon name={icon} size={15} />
            </span>
          )}
        </div>
      </div>
      <span className="kpi-value">{displayValue}</span>
    </div>
  );
}

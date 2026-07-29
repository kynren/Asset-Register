import { ReactNode } from "react";
import { Icon } from "./Icon";

interface KpiCardProps {
  label: string;
  value: ReactNode;
  icon?: string;
  tone?: "primary" | "success" | "warning" | "danger" | "neutral";
}

const toneColors: Record<string, string> = {
  primary: "var(--color-primary)",
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
  neutral: "var(--color-text-muted)",
};

export function KpiCard({ label, value, icon, tone = "primary" }: KpiCardProps) {
  return (
    <div className="kpi-card">
      <div className="row gap-2" style={{ justifyContent: "space-between" }}>
        <span className="kpi-label">{label}</span>
        {icon && <span style={{ color: toneColors[tone] }}><Icon name={icon} size={18} /></span>}
      </div>
      <span className="kpi-value">{value}</span>
    </div>
  );
}

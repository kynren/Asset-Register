import { useId } from "react";
import { useCountUp } from "../hooks/useCountUp";

interface RadialGaugeProps {
  value: number;
  tone?: "primary" | "success" | "warning" | "danger";
  size?: number;
  sublabel?: string;
}

const toneColors: Record<string, string> = {
  primary: "var(--color-primary)",
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
};

export function RadialGauge({ value, tone = "primary", size = 150, sublabel }: RadialGaugeProps) {
  const gid = `rg-${useId().replace(/:/g, "")}`;
  const clamped = Math.max(0, Math.min(100, value));
  const animated = useCountUp(clamped, 900);
  const radius = size / 2 - 14;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - animated / 100);
  const color = toneColors[tone];

  return (
    <div className="row" style={{ justifyContent: "center" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <filter id={gid} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-border)" strokeWidth={10} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          filter={`url(#${gid})`}
          style={{ transition: "stroke-dashoffset 0.3s ease" }}
        />
        <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.19} fontWeight={700} fill="var(--color-text)">
          {Math.round(animated)}%
        </text>
        {sublabel && (
          <text x="50%" y="66%" textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.075} fill="var(--color-text-muted)">
            {sublabel}
          </text>
        )}
      </svg>
    </div>
  );
}

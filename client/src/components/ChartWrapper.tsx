import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Kynren's own brand tokens (see client/src/styles/global.css) rather than a hardcoded palette,
// so chart colors track dark mode and a user's custom AppearanceTheme primary color the same way
// every other themed element already does (see RadialGauge.tsx for the same pattern).
const PALETTE = ["var(--color-primary)", "var(--color-success)", "var(--color-warning)", "var(--color-danger)", "var(--color-text-muted)"];

export function SimpleBarChart({ data, xKey, yKey, height = 260, glow = false }: { data: any[]; xKey: string; yKey: string; height?: number; glow?: boolean }) {
  return (
    <div style={glow ? { filter: "drop-shadow(0 0 6px var(--color-primary-soft))" } : undefined}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip />
          <Bar dataKey={yKey} fill="var(--color-primary)" radius={[4, 4, 0, 0]} animationDuration={800} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SimpleLineChart({ data, xKey, lines, height = 260 }: { data: any[]; xKey: string; lines: { key: string; color?: string }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
        <Tooltip />
        {lines.map((l, i) => (
          <Line key={l.key} type="monotone" dataKey={l.key} stroke={l.color ?? PALETTE[i % PALETTE.length]} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SimplePieChart({ data, dataKey, nameKey, height = 260, glow = false }: { data: any[]; dataKey: string; nameKey: string; height?: number; glow?: boolean }) {
  return (
    <div style={glow ? { filter: "drop-shadow(0 0 8px var(--color-primary-soft))" } : undefined}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Tooltip />
          <Pie data={data} dataKey={dataKey} nameKey={nameKey} outerRadius={90} label={(entry) => entry[nameKey]} animationDuration={800}>
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

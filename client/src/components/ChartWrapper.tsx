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

const PALETTE = ["#1d4ed8", "#0f9d58", "#b45309", "#d92d20", "#7c3aed", "#0891b2", "#667085"];

export function SimpleBarChart({ data, xKey, yKey, height = 260, glow = false }: { data: any[]; xKey: string; yKey: string; height?: number; glow?: boolean }) {
  return (
    <div style={glow ? { filter: "drop-shadow(0 0 6px rgba(29,78,216,0.4))" } : undefined}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e6ec" vertical={false} />
          <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip />
          <Bar dataKey={yKey} fill="#1d4ed8" radius={[4, 4, 0, 0]} animationDuration={800} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SimpleLineChart({ data, xKey, lines, height = 260 }: { data: any[]; xKey: string; lines: { key: string; color?: string }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e6ec" vertical={false} />
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
    <div style={glow ? { filter: "drop-shadow(0 0 8px rgba(29,78,216,0.35))" } : undefined}>
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

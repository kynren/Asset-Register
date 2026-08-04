// Battery indicator styled after a stock "charging battery" glyph — rounded outline, a lightning
// bolt cut through the middle, and vertical fill bars whose lit count tracks the charge level.
// When charging, the lit bars pulse in sequence via CSS keyframes (see .animated-battery-bar in
// global.css) rather than sitting static, matching the "animated battery" reference the sidebar's
// plain icon+percentage indicator doesn't provide.
export function AnimatedBatteryIcon({ level, charging, size = 22 }: { level: number; charging: boolean; size?: number }) {
  const color = level <= 20 ? "var(--color-danger)" : level <= 50 ? "var(--color-warning)" : "var(--color-success)";
  const barCount = 3;
  const litBars = Math.max(1, Math.min(barCount, Math.ceil((level / 100) * barCount)));

  return (
    <svg width={size} height={size * (24 / 28)} viewBox="0 0 28 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color }}>
      <rect x="1.5" y="3.5" width="21" height="17" rx="4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M24.5 10.5V13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {charging && (
        <path
          d="M10.8 5.5L5.5 13H8.7L7.6 18.5L13.2 11H10L10.8 5.5Z"
          fill="var(--color-warning)"
          stroke="var(--color-surface)"
          strokeWidth="0.5"
          strokeLinejoin="round"
        />
      )}
      {Array.from({ length: barCount }).map((_, i) => {
        const lit = i < litBars;
        const x = 13.5 + i * 3;
        return (
          <rect
            key={i}
            className={charging && lit ? "animated-battery-bar" : undefined}
            x={x}
            y={7}
            width={2}
            height={10}
            rx={0.6}
            fill={lit ? "currentColor" : "transparent"}
            opacity={lit ? 1 : 0.25}
            style={charging && lit ? { animationDelay: `${i * 0.18}s` } : undefined}
          />
        );
      })}
    </svg>
  );
}

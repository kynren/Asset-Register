import { CSSProperties } from "react";

// A single pulsing placeholder block. Reuses Tailwind's built-in animate-pulse rather than a
// bespoke keyframe, and the theme's own border color so it reads correctly in light and dark.
export function Skeleton({ width, height = 14, className = "", style }: { width?: string | number; height?: string | number; className?: string; style?: CSSProperties }) {
  return <div className={`animate-pulse bg-border rounded ${className}`} style={{ width, height, ...style }} />;
}

export function SkeletonText({ lines = 1, lastLineWidth = "70%" }: { lines?: number; lastLineWidth?: string }) {
  return (
    <div className="stack gap-1.5">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={12} width={i === lines - 1 && lines > 1 ? lastLineWidth : "100%"} />
      ))}
    </div>
  );
}

// Rows to drop straight into a <tbody> in place of real <tr>s while data loads.
export function SkeletonTableRows({ rows = 6, columns }: { rows?: number; columns: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: columns }).map((_, c) => (
            <td key={c}>
              <Skeleton height={13} width={c === 0 ? "70%" : `${55 + ((r + c) % 3) * 12}%`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function SkeletonCard({ lines = 3, titleWidth = "40%" }: { lines?: number; titleWidth?: string }) {
  return (
    <div className="card stack gap-2">
      <Skeleton height={16} width={titleWidth} />
      <SkeletonText lines={lines} />
    </div>
  );
}

// A generic block-loading state for panels/pages that aren't table- or card-shaped.
export function SkeletonBlock({ height = 120 }: { height?: number | string }) {
  return <Skeleton height={height} width="100%" className="rounded-lg" />;
}

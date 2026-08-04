import type { CSSProperties } from "react";

// Mirrors server/src/lib/docExport.ts's WatermarkPosition — kept as a plain string union (not a
// shared package) since this app has no client/server shared-types build step.
export type WatermarkPosition =
  | "top-left" | "top-center" | "top-right"
  | "middle-left" | "center" | "middle-right"
  | "bottom-left" | "bottom-center" | "bottom-right";

export const WATERMARK_POSITION_OPTIONS: { value: WatermarkPosition; label: string }[] = [
  { value: "top-left", label: "Top Left" },
  { value: "top-center", label: "Top Center" },
  { value: "top-right", label: "Top Right" },
  { value: "middle-left", label: "Middle Left" },
  { value: "center", label: "Center" },
  { value: "middle-right", label: "Middle Right" },
  { value: "bottom-left", label: "Bottom Left" },
  { value: "bottom-center", label: "Bottom Center" },
  { value: "bottom-right", label: "Bottom Right" },
];

// Absolute-position CSS for a watermark layer inside a `position: relative` container — the same
// 9-cell top/bottom/left/right + startsWith/endsWith parsing the PDF/Word exporters use server-side,
// translated into CSS offsets/transforms instead of page coordinates.
export function watermarkPositionStyle(position: string): CSSProperties {
  const style: CSSProperties = { position: "absolute" };
  let translateX = "0";
  let translateY = "0";

  if (position.startsWith("top")) style.top = 20;
  else if (position.startsWith("bottom")) style.bottom = 20;
  else {
    style.top = "50%";
    translateY = "-50%";
  }

  if (position.endsWith("left")) style.left = 20;
  else if (position.endsWith("right")) style.right = 20;
  else {
    style.left = "50%";
    translateX = "-50%";
  }

  if (translateX !== "0" || translateY !== "0") style.transform = `translate(${translateX}, ${translateY})`;
  return style;
}

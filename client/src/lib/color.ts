export const ACCENT_PALETTE = [
  "#1d4ed8", // blue (default)
  "#7c3aed", // violet
  "#0891b2", // cyan
  "#0f9d58", // green
  "#b45309", // amber
  "#d92d20", // red
  "#db2777", // pink
  "#4f46e5", // indigo
];

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("")}`;
}

export function shadeColor(hex: string, percent: number): string {
  const [r, g, b] = hexToRgb(hex);
  const t = percent < 0 ? 0 : 255;
  const p = Math.abs(percent);
  return rgbToHex([r + (t - r) * p, g + (t - g) * p, b + (t - b) * p]);
}

export function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function applyAccentColor(hex: string | null | undefined) {
  const root = document.documentElement;
  if (!hex) {
    root.style.removeProperty("--color-primary");
    root.style.removeProperty("--color-primary-hover");
    root.style.removeProperty("--color-primary-soft");
    return;
  }
  root.style.setProperty("--color-primary", hex);
  root.style.setProperty("--color-primary-hover", shadeColor(hex, -0.15));
  root.style.setProperty("--color-primary-soft", hexToRgba(hex, 0.14));
}

// Applied on top of applyAccentColor by an active AppearanceTheme (see theme/AppearanceContext.tsx)
// — each slot is independently optional (null means "leave the app's own light/dark default
// alone"), so a theme can override just the sidebar color and leave the page background untouched.
export function applyAppearanceOverrides(theme: { sidebarBgColor?: string | null; sidebarTextColor?: string | null; pageBgColor?: string | null } | null | undefined) {
  const root = document.documentElement;
  const set = (prop: string, value?: string | null) => {
    if (value) root.style.setProperty(prop, value);
    else root.style.removeProperty(prop);
  };
  set("--color-sidebar-bg", theme?.sidebarBgColor);
  set("--color-sidebar-text", theme?.sidebarTextColor);
  set("--color-bg", theme?.pageBgColor);
}

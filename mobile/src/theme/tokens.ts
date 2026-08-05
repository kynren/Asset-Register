// Mirrors the brand tokens defined in client/src/styles/global.css (:root / prefers-color-scheme
// dark blocks) — kept in sync by hand since the web app's tokens are plain CSS custom properties,
// not something a mobile screen can consume directly.
export interface ThemeColors {
  bg: string;
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  primarySoft: string;
  success: string;
  warning: string;
  danger: string;
}

export const lightColors: ThemeColors = {
  bg: "#f4f6f9",
  surface: "#ffffff",
  border: "#e2e6ec",
  text: "#1a2233",
  textMuted: "#667085",
  primary: "#1d4ed8",
  primarySoft: "#e8edfd",
  success: "#0f9d58",
  warning: "#b45309",
  danger: "#d92d20",
};

export const darkColors: ThemeColors = {
  bg: "#0d1117",
  surface: "#161b22",
  border: "#2a3140",
  text: "#e6e9ef",
  textMuted: "#8b93a7",
  primary: "#3b82f6",
  primarySoft: "rgba(59, 130, 246, 0.16)",
  success: "#34d399",
  warning: "#fbbf24",
  danger: "#f87171",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 };

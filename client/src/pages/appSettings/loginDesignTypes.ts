export type LoginBackground =
  | { type: "color"; color: string }
  | { type: "gradient"; from: string; to: string; angle: number }
  | { type: "image"; url: string }
  | { type: "video"; url: string };

export type LoginLayoutPreset = "CENTERED" | "SPLIT_VERTICAL" | "SPLIT_HORIZONTAL";

export interface LoginLayout {
  preset: LoginLayoutPreset;
  formSide?: "start" | "end";
}

export type LoginBlock =
  | { id: string; type: "text"; x: number; y: number; text: string; fontSize?: number; color?: string; fontWeight?: string | number }
  | { id: string; type: "icon"; x: number; y: number; icon: string; size?: number; color?: string }
  | { id: string; type: "image"; x: number; y: number; url: string; width?: number };

export interface LoginPageDesignConfig {
  background: LoginBackground;
  layout: LoginLayout;
  blocks: LoginBlock[];
}

export const DEFAULT_LOGIN_DESIGN: LoginPageDesignConfig = {
  background: { type: "color", color: "var(--color-bg)" },
  layout: { preset: "CENTERED" },
  blocks: [],
};

export function loginBackgroundCss(bg: LoginBackground): string {
  switch (bg.type) {
    case "color":
      return bg.color;
    case "gradient":
      return `linear-gradient(${bg.angle}deg, ${bg.from}, ${bg.to})`;
    default:
      return "var(--color-bg)";
  }
}

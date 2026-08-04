import { z } from "zod";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #1d4ed8");

export const createThemeSchema = z.object({
  name: z.string().min(1).max(80),
  navPosition: z.enum(["sidebar", "topbar"]).default("sidebar"),
  primaryColor: hexColor.default("#1d4ed8"),
  sidebarBgColor: hexColor.nullable().optional(),
  sidebarTextColor: hexColor.nullable().optional(),
  pageBgColor: hexColor.nullable().optional(),
  isDark: z.boolean().default(false),
});

export const updateThemeSchema = createThemeSchema.partial();

export const shareThemeSchema = z.object({
  userId: z.number().int(),
});

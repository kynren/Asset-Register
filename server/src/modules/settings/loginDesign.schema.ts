import { z } from "zod";

export const backgroundSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("color"), color: z.string() }),
  z.object({ type: z.literal("gradient"), from: z.string(), to: z.string(), angle: z.number() }),
  z.object({ type: z.literal("image"), url: z.string() }),
  z.object({ type: z.literal("video"), url: z.string() }),
]);

export const layoutSchema = z.object({
  preset: z.enum(["CENTERED", "SPLIT_VERTICAL", "SPLIT_HORIZONTAL"]),
  formSide: z.enum(["start", "end"]).optional(),
});

export const blockSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string(),
    type: z.literal("text"),
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    text: z.string(),
    fontSize: z.number().optional(),
    color: z.string().optional(),
    fontWeight: z.union([z.string(), z.number()]).optional(),
  }),
  z.object({
    id: z.string(),
    type: z.literal("icon"),
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    icon: z.string(),
    size: z.number().optional(),
    color: z.string().optional(),
  }),
  z.object({
    id: z.string(),
    type: z.literal("image"),
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    url: z.string(),
    width: z.number().optional(),
  }),
]);

export const loginPageDesignSchema = z.object({
  background: backgroundSchema,
  layout: layoutSchema,
  blocks: z.array(blockSchema).default([]),
});

export type LoginPageDesignConfig = z.infer<typeof loginPageDesignSchema>;

export const DEFAULT_LOGIN_PAGE_DESIGN: LoginPageDesignConfig = {
  background: { type: "color", color: "var(--color-bg)" },
  layout: { preset: "CENTERED" },
  blocks: [],
};

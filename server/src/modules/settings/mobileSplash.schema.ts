import { z } from "zod";

export const mobileSplashSettingsSchema = z.object({
  enabled: z.boolean(),
  mediaType: z.enum(["PHOTO", "GIF", "VIDEO"]),
  mediaUrl: z.string().nullable(),
  backgroundColor: z.string().min(1),
  minDisplayMs: z.number().int().min(0).max(10_000),
});

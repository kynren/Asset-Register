import { z } from "zod";

export const createOrganizationSchema = z.object({
  organizationName: z.string().min(2).max(100),
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const updateOrganizationSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  schemaName: z
    .string()
    .regex(/^[a-z][a-z0-9_]{2,50}$/, "Schema name must be lowercase letters, numbers, and underscores, starting with a letter.")
    .optional(),
});

// `rememberMinutes: null` means "confirmed until logout" (no timer) — one of the four presets the
// client offers (1h / 8h / 24h / until logout).
export const switchOrganizationSchema = z
  .object({
    password: z.string().optional(),
    pin: z.string().regex(/^\d{6}$/).optional(),
    rememberMinutes: z.number().int().positive().nullable(),
  })
  .refine((data) => Boolean(data.password) !== Boolean(data.pin), {
    message: "Provide exactly one of password or pin",
  });

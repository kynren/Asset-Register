import { z } from "zod";

export const loginSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1).optional(),
    pin: z.string().regex(/^\d{6}$/, "PIN must be 6 digits").optional(),
    mfaToken: z.string().optional(),
  })
  .refine((d) => Boolean(d.password) !== Boolean(d.pin), { message: "Provide either password or PIN, not both." });

export const setPinSchema = z.object({
  currentPassword: z.string().min(1),
  pin: z.string().regex(/^\d{6}$/, "PIN must be 6 digits"),
});

export const removePinSchema = z.object({
  currentPassword: z.string().min(1),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export const magicLoginSchema = z.object({
  token: z.string().min(1),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const mfaVerifySchema = z.object({
  token: z.string().min(6).max(6),
});

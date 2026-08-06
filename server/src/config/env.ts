import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(4000),
  // Comma-separated list — the web client and the Expo web preview run on different ports in dev.
  CLIENT_ORIGIN: z.string().default("http://localhost:5173,http://localhost:8081"),
  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_IN: z.string().default("15m"),
  REFRESH_JWT_SECRET: z.string().min(1),
  REFRESH_JWT_EXPIRES_IN: z.string().default("7d"),
  REFRESH_COOKIE_NAME: z.string().default("kynren_refresh"),
  ENCRYPTION_KEY: z.string().min(1),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default("Kynren Asset Register <no-reply@kynren.local>"),
});

export const env = envSchema.parse(process.env);

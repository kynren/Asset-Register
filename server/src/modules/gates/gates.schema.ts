import { z } from "zod";

export const createNet2ServerSchema = z.object({
  name: z.string().min(1),
  ipAddress: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(8443),
  clientId: z.string().optional().nullable(),
  username: z.string().optional().nullable(),
  password: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const updateNet2ServerSchema = createNet2ServerSchema.partial();

export const discoverNet2Schema = z.object({
  startIp: z.string().min(1),
  endIp: z.string().min(1),
});

import { z } from "zod";

export const createOrganizationSchema = z.object({
  organizationName: z.string().min(2).max(100),
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

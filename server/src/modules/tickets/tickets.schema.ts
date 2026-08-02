import { z } from "zod";

export const createTicketSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  type: z.enum(["ACTION", "INFORMATION"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  categoryId: z.number().int().nullable().optional(),
  assetId: z.number().int().nullable().optional(),
  locationId: z.number().int().nullable().optional(),
  assigneeId: z.number().int().nullable().optional(),
  assignedTeamId: z.number().int().nullable().optional(),
  dueAt: z.coerce.date().nullable().optional(),
});

export const updateTicketSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  type: z.enum(["ACTION", "INFORMATION"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  categoryId: z.number().int().nullable().optional(),
  assetId: z.number().int().nullable().optional(),
  locationId: z.number().int().nullable().optional(),
  assigneeId: z.number().int().nullable().optional(),
  assignedTeamId: z.number().int().nullable().optional(),
  dueAt: z.coerce.date().nullable().optional(),
});

export const updateStatusSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
});

export const addCommentSchema = z.object({
  body: z.string().min(1),
  isInternal: z.boolean().optional(),
});

export const satisfactionSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

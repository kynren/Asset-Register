import { z } from "zod";

export const createTicketSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  type: z.enum(["ACTION", "INFORMATION"]).optional(),
  itilType: z.enum(["INCIDENT", "REQUEST", "PROBLEM", "CHANGE"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  categoryId: z.number().int().nullable().optional(),
  templateId: z.number().int().nullable().optional(),
  assetId: z.number().int().nullable().optional(),
  locationId: z.number().int().nullable().optional(),
  assigneeIds: z.array(z.number().int()).optional(),
  assignedTeamIds: z.array(z.number().int()).optional(),
  dueAt: z.coerce.date().nullable().optional(),
});

export const updateTicketSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  type: z.enum(["ACTION", "INFORMATION"]).optional(),
  itilType: z.enum(["INCIDENT", "REQUEST", "PROBLEM", "CHANGE"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  categoryId: z.number().int().nullable().optional(),
  slaId: z.number().int().nullable().optional(),
  assetId: z.number().int().nullable().optional(),
  locationId: z.number().int().nullable().optional(),
  assigneeIds: z.array(z.number().int()).optional(),
  assignedTeamIds: z.array(z.number().int()).optional(),
  dueAt: z.coerce.date().nullable().optional(),
});

export const updateStatusSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "PENDING", "RESOLVED", "CLOSED"]),
});

export const addCommentSchema = z.object({
  body: z.string().min(1),
  isInternal: z.boolean().optional(),
});

export const satisfactionSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

export const createTaskSchema = z.object({
  content: z.string().min(1),
  category: z.string().optional(),
  actionTimeSeconds: z.number().int().min(0).optional(),
  begin: z.coerce.date().nullable().optional(),
  end: z.coerce.date().nullable().optional(),
  state: z.enum(["TODO", "DONE"]).optional(),
  assignedToId: z.number().int().nullable().optional(),
  isPrivate: z.boolean().optional(),
});

export const updateTaskSchema = createTaskSchema.partial();

export const createSolutionSchema = z.object({
  content: z.string().min(1),
});

export const answerSolutionSchema = z.object({
  accept: z.boolean(),
  comment: z.string().optional(),
});

export const requestApprovalSchema = z
  .object({
    targetUserId: z.number().int().nullable().optional(),
    targetTeamId: z.number().int().nullable().optional(),
    comment: z.string().optional(),
  })
  .refine((v) => Boolean(v.targetUserId) !== Boolean(v.targetTeamId), {
    message: "Exactly one of targetUserId or targetTeamId is required",
  });

export const answerApprovalSchema = z
  .object({
    accept: z.boolean(),
    comment: z.string().optional(),
  })
  .refine((v) => v.accept || Boolean(v.comment?.trim()), { message: "A comment is required to refuse" });

export const createLinkSchema = z.object({
  linkedTicketId: z.number().int(),
  linkType: z.enum(["RELATES_TO", "CAUSES", "CAUSED_BY", "DUPLICATES"]).optional(),
});

export const attachKnowledgeArticleSchema = z.object({
  articleId: z.number().int(),
});

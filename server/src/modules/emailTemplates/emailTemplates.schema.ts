import { z } from "zod";

const alignSchema = z.enum(["left", "center", "right"]).optional();

export const blockSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string(), type: z.literal("heading"), text: z.string(), align: alignSchema }),
  z.object({ id: z.string(), type: z.literal("text"), text: z.string(), align: alignSchema }),
  z.object({ id: z.string(), type: z.literal("image"), url: z.string(), alt: z.string().optional(), width: z.number().optional(), align: alignSchema }),
  z.object({ id: z.string(), type: z.literal("button"), text: z.string(), url: z.string(), color: z.string().optional() }),
  z.object({ id: z.string(), type: z.literal("divider") }),
  z.object({ id: z.string(), type: z.literal("spacer"), height: z.number().optional() }),
]);

export const emailEventTypeSchema = z.enum(["ACCOUNT_CREATED", "ASSET_ASSIGNED", "PASSWORD_RESET", "TASK_OVERDUE", "LOW_STOCK", "STOCK_ISSUED"]);

export const createEmailTemplateSchema = z.object({
  name: z.string().min(1),
  eventType: emailEventTypeSchema,
  subject: z.string().min(1),
  blocks: z.array(blockSchema).default([]),
});

// eventType is fixed at creation — "assigning a template to an event" is a creation-time
// decision, not something you migrate an existing template between later.
export const updateEmailTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  subject: z.string().min(1).optional(),
  blocks: z.array(blockSchema).optional(),
});

export const sendTestEmailSchema = z.object({
  to: z.string().email(),
});

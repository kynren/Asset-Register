import { z } from "zod";

export const fieldTypeEnum = z.enum(["TEXT", "TEXTAREA", "NUMBER", "DATE", "SELECT", "CHECKBOX"]);

export const createTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export const updateTemplateSchema = createTemplateSchema.partial();

export const createFieldSchema = z.object({
  label: z.string().min(1),
  fieldType: fieldTypeEnum.default("TEXT"),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
});

export const updateFieldSchema = createFieldSchema.partial();

export const reorderFieldsSchema = z.object({
  orderedFieldIds: z.array(z.number().int()).min(1),
});

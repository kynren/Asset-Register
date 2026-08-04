import { z } from "zod";

export const docTypeSchema = z.enum([
  "SOP",
  "WORK_INSTRUCTION",
  "TECHNICAL_RUNBOOK",
  "MAINTENANCE_CHECKLIST",
  "POLICY",
  "SHOW_PRODUCTION",
  "TRAINING",
  "GENERAL",
]);
export type DocTypeValue = z.infer<typeof docTypeSchema>;

// One structured "sections" shape per document type, based on standard real-world formats:
// SOP / Work Instruction hierarchy (purpose+scope+responsibilities+steps vs. narrower granular
// steps), IT/engineering runbooks (system, routine ops, troubleshooting, escalation), maintenance
// checklists (frequency + checklist items), policy documents (statement + approval authority),
// theatrical/show production cue sheets, and training/induction material. GENERAL is a plain
// free-text fallback matching the existing simple Knowledge Base articles.
const sopSections = z.object({
  purpose: z.string().default(""),
  scope: z.string().default(""),
  responsibilities: z.string().default(""),
  steps: z.array(z.object({ step: z.string() })).default([]),
  safetyNotes: z.string().default(""),
  references: z.string().default(""),
});

const workInstructionSections = z.object({
  relatedSop: z.string().default(""),
  toolsRequired: z.string().default(""),
  steps: z.array(z.object({ step: z.string() })).default([]),
  qualityChecks: z.string().default(""),
});

const technicalRunbookSections = z.object({
  systemCovered: z.string().default(""),
  prerequisites: z.string().default(""),
  routineOperations: z.string().default(""),
  troubleshooting: z.array(z.object({ issue: z.string(), resolution: z.string() })).default([]),
  escalationPath: z.string().default(""),
  emergencyProcedure: z.string().default(""),
});

const maintenanceChecklistSections = z.object({
  assetOrSystem: z.string().default(""),
  frequency: z.string().default(""),
  checklistItems: z.array(z.object({ item: z.string(), criteria: z.string().default("") })).default([]),
});

const policySections = z.object({
  policyStatement: z.string().default(""),
  procedure: z.string().default(""),
  approvalAuthority: z.string().default(""),
  effectiveDate: z.string().default(""),
});

const showProductionSections = z.object({
  showName: z.string().default(""),
  cueSheet: z.array(z.object({ cue: z.string(), description: z.string(), department: z.string().default("") })).default([]),
  technicalRequirements: z.string().default(""),
  safetyNotes: z.string().default(""),
});

const trainingSections = z.object({
  role: z.string().default(""),
  objectives: z.string().default(""),
  content: z.array(z.object({ section: z.string(), detail: z.string() })).default([]),
  assessmentCriteria: z.string().default(""),
});

const generalSections = z.object({
  body: z.string().default(""),
});

export const SECTIONS_SCHEMA_BY_TYPE: Record<DocTypeValue, z.ZodTypeAny> = {
  SOP: sopSections,
  WORK_INSTRUCTION: workInstructionSections,
  TECHNICAL_RUNBOOK: technicalRunbookSections,
  MAINTENANCE_CHECKLIST: maintenanceChecklistSections,
  POLICY: policySections,
  SHOW_PRODUCTION: showProductionSections,
  TRAINING: trainingSections,
  GENERAL: generalSections,
};

export const accessGrantSchema = z
  .object({ userId: z.number().int().optional(), teamId: z.number().int().optional(), level: z.enum(["EDIT", "DELETE"]) })
  .refine((v) => (v.userId != null) !== (v.teamId != null), { message: "Provide exactly one of userId or teamId" });

export const createDocumentSchema = z.object({
  title: z.string().min(1),
  docType: docTypeSchema,
  category: z.string().min(1),
  collectionId: z.number().int().positive(),
  summary: z.string().optional(),
  sections: z.record(z.any()),
  tags: z.array(z.string()).default([]),
  isPublished: z.boolean().default(true),
  reviewDueDate: z.string().datetime().nullable().optional(),
  access: z.array(accessGrantSchema).optional(),
});

// docType is fixed at creation — changing it would orphan the sections shape a document was
// built with, same reasoning as EmailTemplate.eventType being immutable after creation.
// collectionId, unlike docType, is safe to change later — it's just a grouping, not tied to the
// sections shape — so a document can be moved between collections.
export const updateDocumentSchema = z.object({
  title: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  collectionId: z.number().int().positive().optional(),
  summary: z.string().optional(),
  sections: z.record(z.any()).optional(),
  tags: z.array(z.string()).optional(),
  isPublished: z.boolean().optional(),
  reviewDueDate: z.string().datetime().nullable().optional(),
});

export const createCollectionSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().optional(),
});

export const updateCollectionSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().optional(),
});

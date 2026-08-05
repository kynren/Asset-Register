export type DocType = "SOP" | "WORK_INSTRUCTION" | "TECHNICAL_RUNBOOK" | "MAINTENANCE_CHECKLIST" | "POLICY" | "SHOW_PRODUCTION" | "TRAINING" | "GENERAL";

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  SOP: "SOP",
  WORK_INSTRUCTION: "Work Instruction",
  TECHNICAL_RUNBOOK: "Technical Runbook",
  MAINTENANCE_CHECKLIST: "Maintenance Checklist",
  POLICY: "Policy",
  SHOW_PRODUCTION: "Show Production",
  TRAINING: "Training",
  GENERAL: "General",
};

interface UserRef {
  id: number;
  firstName: string;
  lastName: string;
}

export interface DocumentSummary {
  id: number;
  title: string;
  docType: DocType;
  category: string | null;
  collectionId: number | null;
  collection: { id: number; name: string } | null;
  summary: string | null;
  tags: string[];
  isPublished: boolean;
  reviewDueDate: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: UserRef | null;
}

export interface DocumentAttachment {
  id: number;
  fileName: string;
  mimeType: string | null;
}

export interface DocumentDetail extends DocumentSummary {
  // Shape varies per docType (see server/src/modules/docs/docs.schema.ts SECTIONS_SCHEMA_BY_TYPE)
  // — rendered generically on mobile rather than with one bespoke layout per type.
  sections: Record<string, unknown>;
  attachments: DocumentAttachment[];
  createdById: number;
  access: import("../lib/accessControl").AccessGrant[];
}

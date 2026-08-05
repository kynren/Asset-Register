export type DocType =
  | "SOP"
  | "WORK_INSTRUCTION"
  | "TECHNICAL_RUNBOOK"
  | "MAINTENANCE_CHECKLIST"
  | "POLICY"
  | "SHOW_PRODUCTION"
  | "TRAINING"
  | "GENERAL";

export const DOC_TYPES: DocType[] = [
  "SOP",
  "WORK_INSTRUCTION",
  "TECHNICAL_RUNBOOK",
  "MAINTENANCE_CHECKLIST",
  "POLICY",
  "SHOW_PRODUCTION",
  "TRAINING",
  "GENERAL",
];

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  SOP: "Standard Operating Procedure",
  WORK_INSTRUCTION: "Work Instruction",
  TECHNICAL_RUNBOOK: "Technical Runbook",
  MAINTENANCE_CHECKLIST: "Maintenance Checklist",
  POLICY: "Policy",
  SHOW_PRODUCTION: "Show / Production Document",
  TRAINING: "Training Material",
  GENERAL: "General Document",
};

export const DOC_TYPE_DESCRIPTIONS: Record<DocType, string> = {
  SOP: "A high-level, systematic procedure — purpose, scope, responsibilities, and numbered steps. Use for processes spanning multiple people or departments.",
  WORK_INSTRUCTION: "Detailed, granular steps for one specific task — narrower and more prescriptive than an SOP. Use for a single hands-on task.",
  TECHNICAL_RUNBOOK: "How to operate and troubleshoot a system — routine operations, troubleshooting steps, and escalation path. Use for IT/technical systems.",
  MAINTENANCE_CHECKLIST: "A recurring inspection or maintenance checklist with a frequency and pass criteria per item.",
  POLICY: "A formal policy statement with its procedure and approval authority — e.g. finance or HR policy.",
  SHOW_PRODUCTION: "A cue sheet / show document — cues, descriptions, and department responsibilities for a live show.",
  TRAINING: "Induction or training material — objectives, content sections, and assessment criteria.",
  GENERAL: "A free-form document or note, for anything that doesn't fit a more specific type.",
};

export const DOC_CATEGORIES = [
  "IT & Computing Systems",
  "Finance",
  "Technical / Engineering",
  "Actors & Performers",
  "Staff & HR",
  "Hydraulics",
  "Lighting",
  "Sound",
  "Automation & Show Control",
  "Shows & Production",
  "Facilities",
  "Guest Services",
  "General",
];

interface TextFieldSpec {
  key: string;
  label: string;
  kind: "text" | "textarea" | "date";
  placeholder?: string;
}

interface ListFieldSpec {
  key: string;
  label: string;
  kind: "list";
  itemFields: { key: string; label: string; kind: "text" | "textarea" }[];
}

export type FieldSpec = TextFieldSpec | ListFieldSpec;

// Mirrors client/src/pages/docs/docsConstants.ts's DOC_TYPE_FIELDS — one declarative field layout
// per document type, driving both the mobile create/edit form (DocumentFormScreen) and staying
// consistent with the read-only detail view.
export const DOC_TYPE_FIELDS: Record<DocType, FieldSpec[]> = {
  SOP: [
    { key: "purpose", label: "Purpose", kind: "textarea", placeholder: "Why this procedure exists" },
    { key: "scope", label: "Scope", kind: "textarea", placeholder: "What this procedure covers, and what it doesn't" },
    { key: "responsibilities", label: "Responsibilities", kind: "textarea", placeholder: "Who is accountable for each part" },
    { key: "steps", label: "Procedure Steps", kind: "list", itemFields: [{ key: "step", label: "Step", kind: "textarea" }] },
    { key: "safetyNotes", label: "Safety Notes / PPE", kind: "textarea" },
    { key: "references", label: "References & Related Documents", kind: "textarea" },
  ],
  WORK_INSTRUCTION: [
    { key: "relatedSop", label: "Related SOP", kind: "text", placeholder: "e.g. SOP-014 Hydraulic Lift Startup" },
    { key: "toolsRequired", label: "Tools / Materials Required", kind: "textarea" },
    { key: "steps", label: "Steps", kind: "list", itemFields: [{ key: "step", label: "Step", kind: "textarea" }] },
    { key: "qualityChecks", label: "Quality / Safety Checks", kind: "textarea" },
  ],
  TECHNICAL_RUNBOOK: [
    { key: "systemCovered", label: "System Covered", kind: "text" },
    { key: "prerequisites", label: "Prerequisites / Access Needed", kind: "textarea" },
    { key: "routineOperations", label: "Routine Operations", kind: "textarea" },
    {
      key: "troubleshooting",
      label: "Troubleshooting",
      kind: "list",
      itemFields: [
        { key: "issue", label: "Issue", kind: "text" },
        { key: "resolution", label: "Resolution", kind: "textarea" },
      ],
    },
    { key: "escalationPath", label: "Escalation Path", kind: "textarea" },
    { key: "emergencyProcedure", label: "Emergency Procedure", kind: "textarea" },
  ],
  MAINTENANCE_CHECKLIST: [
    { key: "assetOrSystem", label: "Asset / System", kind: "text" },
    { key: "frequency", label: "Frequency", kind: "text", placeholder: "e.g. Daily, Weekly, Monthly" },
    {
      key: "checklistItems",
      label: "Checklist Items",
      kind: "list",
      itemFields: [
        { key: "item", label: "Item", kind: "text" },
        { key: "criteria", label: "Pass Criteria", kind: "text" },
      ],
    },
  ],
  POLICY: [
    { key: "policyStatement", label: "Policy Statement", kind: "textarea" },
    { key: "procedure", label: "Procedure", kind: "textarea" },
    { key: "approvalAuthority", label: "Approval Authority", kind: "text" },
    { key: "effectiveDate", label: "Effective Date", kind: "date" },
  ],
  SHOW_PRODUCTION: [
    { key: "showName", label: "Show Name", kind: "text" },
    {
      key: "cueSheet",
      label: "Cue Sheet",
      kind: "list",
      itemFields: [
        { key: "cue", label: "Cue #", kind: "text" },
        { key: "description", label: "Description", kind: "textarea" },
        { key: "department", label: "Department", kind: "text" },
      ],
    },
    { key: "technicalRequirements", label: "Technical Requirements", kind: "textarea" },
    { key: "safetyNotes", label: "Safety Notes", kind: "textarea" },
  ],
  TRAINING: [
    { key: "role", label: "Role / Audience", kind: "text" },
    { key: "objectives", label: "Learning Objectives", kind: "textarea" },
    {
      key: "content",
      label: "Content Sections",
      kind: "list",
      itemFields: [
        { key: "section", label: "Section Title", kind: "text" },
        { key: "detail", label: "Detail", kind: "textarea" },
      ],
    },
    { key: "assessmentCriteria", label: "Assessment Criteria", kind: "textarea" },
  ],
  GENERAL: [{ key: "body", label: "Content", kind: "textarea" }],
};

export function emptySections(docType: DocType): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of DOC_TYPE_FIELDS[docType]) {
    result[field.key] = field.kind === "list" ? [] : "";
  }
  return result;
}

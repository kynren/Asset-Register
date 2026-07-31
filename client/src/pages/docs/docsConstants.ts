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

// Book-cover gradient + icon per type, used by the library dashboard's shelf cards so each type
// reads as a distinct "genre" at a glance, the way Netflix tiles use color to signal category.
export const DOC_TYPE_COLORS: Record<DocType, { from: string; to: string }> = {
  SOP: { from: "#2563eb", to: "#1e3a8a" },
  WORK_INSTRUCTION: { from: "#059669", to: "#065f46" },
  TECHNICAL_RUNBOOK: { from: "#7c3aed", to: "#4c1d95" },
  MAINTENANCE_CHECKLIST: { from: "#d97706", to: "#92400e" },
  POLICY: { from: "#dc2626", to: "#7f1d1d" },
  SHOW_PRODUCTION: { from: "#db2777", to: "#831843" },
  TRAINING: { from: "#0891b2", to: "#164e63" },
  GENERAL: { from: "#475569", to: "#1e293b" },
};

export const DOC_TYPE_ICONS: Record<DocType, string> = {
  SOP: "fileText",
  WORK_INSTRUCTION: "wrench",
  TECHNICAL_RUNBOOK: "terminal",
  MAINTENANCE_CHECKLIST: "check",
  POLICY: "shield",
  SHOW_PRODUCTION: "star",
  TRAINING: "book",
  GENERAL: "bookmark",
};

// Curated, not exhaustive — the category field on a document is free text (a datalist suggests
// these), so new categories can be added without a code change.
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

// One declarative field layout per document type — drives both the create/edit form and the
// read-only detail view generically, so adding a 9th document type later means adding one entry
// here rather than a whole new form/view component pair.
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

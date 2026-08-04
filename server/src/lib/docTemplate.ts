import { z } from "zod";
import { Document as DocxDocument, Packer, Paragraph, HeadingLevel, TextRun } from "docx";
import { SECTIONS_SCHEMA_BY_TYPE, DocTypeValue } from "../modules/docs/docs.schema";
import { titleCase } from "./docExport";

function unwrapDefault(schema: z.ZodTypeAny): z.ZodTypeAny {
  return schema instanceof z.ZodDefault ? unwrapDefault(schema._def.innerType) : schema;
}

export interface TemplateField {
  key: string;
  label: string;
  isList: boolean;
  itemFields: { key: string; label: string }[];
}

// Derived straight from the same Zod schema docs.controller.ts validates against — the template's
// headings, the docx import's heading-matching (docImport.ts), and docExport.ts's PDF/Word export
// all key off this one `titleCase(fieldKey)` mapping, so a user who fills in the downloaded
// template and re-imports it gets an exact heading match with no separate label list to drift.
export function getTemplateFields(docType: DocTypeValue): TemplateField[] {
  const schema = SECTIONS_SCHEMA_BY_TYPE[docType] as z.ZodObject<Record<string, z.ZodTypeAny>>;
  return Object.entries(schema.shape).map(([key, fieldSchema]) => {
    const unwrapped = unwrapDefault(fieldSchema);
    if (unwrapped instanceof z.ZodArray) {
      const itemShape = (unwrapDefault(unwrapped.element) as z.ZodObject<Record<string, z.ZodTypeAny>>).shape;
      return {
        key,
        label: titleCase(key),
        isList: true,
        itemFields: Object.keys(itemShape).map((itemKey) => ({ key: itemKey, label: titleCase(itemKey) })),
      };
    }
    return { key, label: titleCase(key), isList: false, itemFields: [] };
  });
}

export async function buildDocTemplateBuffer(docType: DocTypeValue): Promise<Buffer> {
  const fields = getTemplateFields(docType);
  const children: Paragraph[] = [
    new Paragraph({ text: `${docType.replace(/_/g, " ")} Template`, heading: HeadingLevel.TITLE }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Fill in the sections below, keeping each heading as-is, then import this file from Docs & SOPs to create a new document with these headings mapped back into the matching fields.",
          italics: true,
          color: "667085",
        }),
      ],
      spacing: { after: 200 },
    }),
  ];

  for (const field of fields) {
    children.push(new Paragraph({ text: field.label, heading: HeadingLevel.HEADING_2, spacing: { before: 300 } }));
    if (field.isList) {
      const itemLabels = field.itemFields.map((f) => f.label).join(", ");
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `One row per line — prefix each with ${itemLabels}, e.g.:`, italics: true, color: "667085" })],
        })
      );
      children.push(new Paragraph({ text: field.itemFields.map((f) => `${f.label}: …`).join("  ") }));
      children.push(new Paragraph({ text: "" }));
    } else {
      children.push(new Paragraph({ text: "" }));
    }
  }

  const docx = new DocxDocument({ sections: [{ children }] });
  return Packer.toBuffer(docx);
}

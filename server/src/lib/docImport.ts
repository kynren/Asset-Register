import mammoth from "mammoth";
import { DocTypeValue } from "../modules/docs/docs.schema";
import { getTemplateFields } from "./docTemplate";
import { htmlToParagraphs } from "./docExport";

// Word and PDF files don't map onto any of docs.schema.ts's typed section shapes (SOP steps,
// checklist items, etc.) — there's no reliable way to guess which field a paragraph belongs to.
// So import always lands as a GENERAL document with everything in its one free-text `body` field;
// the user re-files it into a more specific type afterward if they want that structure.
export async function convertUploadToHtml(buffer: Buffer, mimeType: string, originalName: string): Promise<string> {
  const isDocx = mimeType.includes("wordprocessingml") || /\.docx$/i.test(originalName);
  const isPdf = mimeType.includes("pdf") || /\.pdf$/i.test(originalName);

  if (isDocx) {
    const result = await mammoth.convertToHtml({ buffer });
    return result.value;
  }
  if (isPdf) {
    // pdf-parse ships no type declarations and its main export misbehaves under esModuleInterop,
    // so require + a targeted any-cast here is simpler than hand-writing a .d.ts for one call site.
    const pdfParse = require("pdf-parse") as (data: Buffer) => Promise<{ text: string }>;
    const { text } = await pdfParse(buffer);
    return text
      .split(/\n{2,}/)
      .map((para) => para.trim())
      .filter(Boolean)
      .map((para) => `<p>${para.replace(/\n/g, " ").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`)
      .join("\n");
  }
  throw new Error("Only .pdf and .docx files can be imported");
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

function normalizeHeading(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

interface HeadingBlock {
  heading: string;
  contentHtml: string;
}

// mammoth's default style map already turns Word's "Heading 1/2/3" paragraph styles into
// <h1>/<h2>/<h3> tags — the same styles docTemplate.ts's HeadingLevel.HEADING_2 paragraphs map to
// on the way out — so splitting on those tags here recovers exactly the field-label headings the
// template started with, with no custom mammoth styleMap needed.
function splitIntoHeadingBlocks(html: string): HeadingBlock[] {
  const parts = html.split(/(<h[1-3][^>]*>[\s\S]*?<\/h[1-3]>)/gi);
  const blocks: HeadingBlock[] = [];
  let current: HeadingBlock | null = null;
  for (const part of parts) {
    const match = part.match(/^<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>$/i);
    if (match) {
      if (current) blocks.push(current);
      current = { heading: stripTags(match[1]), contentHtml: "" };
    } else if (current) {
      current.contentHtml += part;
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

// The template's own instructions (see docTemplate.ts) tell the user to prefix each row with its
// item-field labels — "Step: …" for a single-field list, "Cue #: … Description: … Department: …"
// for a multi-field one — so recovering a row is just locating those same label prefixes in order.
function parseListRow(line: string, itemFields: { key: string; label: string }[]): Record<string, string> {
  if (itemFields.length === 1) return { [itemFields[0].key]: line.trim() };

  const positions = itemFields
    .map((f) => ({ key: f.key, index: line.indexOf(`${f.label}:`), labelLen: f.label.length + 1 }))
    .filter((p) => p.index !== -1)
    .sort((a, b) => a.index - b.index);

  if (positions.length === 0) return { [itemFields[0].key]: line.trim() };

  const row: Record<string, string> = {};
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].index + positions[i].labelLen;
    const end = i + 1 < positions.length ? positions[i + 1].index : line.length;
    row[positions[i].key] = line.slice(start, end).trim();
  }
  return row;
}

export interface DocxImportResult {
  sections: Record<string, unknown>;
  unmatchedHeadings: string[];
}

// Matches each Word heading in the uploaded file against the target docType's own field labels
// (the exact same titleCase(fieldKey) values the downloadable template was built from — see
// docTemplate.ts) and fills the matching field. A heading that doesn't match anything the doc type
// defines isn't dropped — its content is appended under "Additional Notes" (sections.additionalNotes)
// so the user can review and re-file it manually rather than losing it silently.
export async function convertDocxToSections(buffer: Buffer, docType: DocTypeValue): Promise<DocxImportResult> {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const blocks = splitIntoHeadingBlocks(html);
  const fields = getTemplateFields(docType);
  const byNormalizedLabel = new Map(fields.map((f) => [normalizeHeading(f.label), f]));

  const sections: Record<string, unknown> = {};
  const unmatchedNotes: string[] = [];
  const unmatchedHeadings: string[] = [];

  for (const block of blocks) {
    const field = byNormalizedLabel.get(normalizeHeading(block.heading));
    if (!field) {
      if (stripTags(block.contentHtml)) {
        unmatchedNotes.push(`<h3>${block.heading}</h3>${block.contentHtml}`);
        unmatchedHeadings.push(block.heading);
      }
      continue;
    }

    if (field.isList) {
      const lines = htmlToParagraphs(block.contentHtml);
      sections[field.key] = lines.map((line) => parseListRow(line, field.itemFields));
    } else {
      const trimmed = block.contentHtml.trim();
      if (trimmed) sections[field.key] = trimmed;
    }
  }

  if (unmatchedNotes.length > 0) {
    sections.additionalNotes = unmatchedNotes.join("\n");
  }

  return { sections, unmatchedHeadings };
}

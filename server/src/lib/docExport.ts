import PDFDocument from "pdfkit";
import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  Header,
  Footer,
  ImageRun,
  HorizontalPositionAlign,
  HorizontalPositionRelativeFrom,
  VerticalPositionAlign,
  VerticalPositionRelativeFrom,
  TextWrappingType,
  AlignmentType,
} from "docx";
import { DocTypeValue } from "../modules/docs/docs.schema";

// The 9-cell grid used by the docs watermark position picker (Admin & Setup / App Settings →
// Branding) — shared verbatim with client/src/lib/watermarkPosition.ts's WatermarkPosition type.
export type WatermarkPosition =
  | "top-left" | "top-center" | "top-right"
  | "middle-left" | "center" | "middle-right"
  | "bottom-left" | "bottom-center" | "bottom-right";

export interface WatermarkAsset {
  buffer: Buffer;
  width: number;
  height: number;
  position: WatermarkPosition;
  /** docx's ImageRun needs an explicit raster type — settings.routes.ts only accepts png/jpeg uploads for the watermark. */
  docxType: "png" | "jpg";
}

export function titleCase(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
}

// Turns TipTap's HTML output into plain paragraphs — block tags become line breaks, everything
// else is stripped. Loses bold/italic/etc, but keeps the document's actual structure (paragraphs,
// list items) readable in a plain PDF/Word export rather than running every field together.
export function htmlToParagraphs(html: string): string[] {
  const withBreaks = html
    .replace(/<\/(p|li|h[1-6]|div)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ");
  const text = withBreaks.replace(/<[^>]*>/g, "");
  return text
    .split("\n")
    .map((line) => line.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim())
    .filter(Boolean);
}

// Mirrors docs.controller.ts's flattenToText recursion, but keeps structure instead of collapsing
// to one search string — each top-level sections key becomes a heading, each leaf becomes one or
// more paragraph lines under it.
export interface DocBlock {
  heading: string;
  paragraphs: string[];
}

function renderValue(value: unknown): string[] {
  if (value === null || value === undefined || value === "") return [];
  if (typeof value === "string") return htmlToParagraphs(value);
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => {
      if (item !== null && typeof item === "object") {
        const parts = Object.entries(item as Record<string, unknown>)
          .map(([k, v]) => `${titleCase(k)}: ${renderValue(v).join(" ")}`)
          .filter((s) => !s.endsWith(": "));
        return [`${i + 1}. ${parts.join(" — ")}`];
      }
      return [`• ${renderValue(item).join(" ")}`];
    });
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => {
      const rendered = renderValue(v);
      return rendered.length ? [`${titleCase(k)}: ${rendered.join(" ")}`] : [];
    });
  }
  return [];
}

export function sectionsToBlocks(sections: Record<string, unknown>): DocBlock[] {
  return Object.entries(sections)
    .map(([key, value]) => ({ heading: titleCase(key), paragraphs: renderValue(value) }))
    .filter((block) => block.paragraphs.length > 0);
}

export interface ExportableDocument {
  title: string;
  docType: DocTypeValue;
  category: string;
  summary: string | null;
  sections: Record<string, unknown>;
  tags: string[];
  updatedAt: Date;
}

// Maps the 9-cell position grid to a top-left (x, y) box within the page margins, sized down to
// fit a max footprint so a large source logo doesn't dominate the page — same box math the docx
// builder below mirrors via horizontal/vertical align instead of raw coordinates.
function watermarkBox(pageWidth: number, pageHeight: number, margin: number, watermark: WatermarkAsset) {
  const maxW = 150;
  const maxH = 90;
  const scale = Math.min(maxW / watermark.width, maxH / watermark.height, 1);
  const w = watermark.width * scale;
  const h = watermark.height * scale;
  const y = watermark.position.startsWith("top") ? margin : watermark.position.startsWith("bottom") ? pageHeight - margin - h : (pageHeight - h) / 2;
  const x = watermark.position.endsWith("left") ? margin : watermark.position.endsWith("right") ? pageWidth - margin - w : (pageWidth - w) / 2;
  return { x, y, w, h };
}

// pdfkit's bundled PNG/JPEG decoder is stricter than the spec in places — a watermark image that
// some other tool (or even a spec-compliant encoder using an unusual filter/compression strategy)
// produced can make pdf.image() throw synchronously. That must never take down the whole document
// export — a document with no watermark is fine, a 500 on every export because of an old flag
// icon someone uploaded a year ago is not.
function drawPdfWatermark(pdf: PDFKit.PDFDocument, watermark: WatermarkAsset) {
  const savedX = pdf.x;
  const savedY = pdf.y;
  try {
    const { x, y, w, h } = watermarkBox(pdf.page.width, pdf.page.height, 30, watermark);
    pdf.save();
    pdf.opacity(0.14);
    pdf.image(watermark.buffer, x, y, { width: w, height: h });
    pdf.restore();
  } catch (err) {
    console.error("Failed to draw docs watermark in PDF export, continuing without it:", err);
  }
  pdf.x = savedX;
  pdf.y = savedY;
}

// A small, unobtrusive "© {year} {org}" line pinned to the bottom of every page — every
// downloadable document export in the app (docs/SOPs, asset reports, harness certifications)
// draws this the same way. 8pt is the smallest size that stays legible in both a PDF viewer and
// print; there's no literal "8px" unit in either pdfkit or docx (both work in points), so this is
// the closest real equivalent to what was asked for.
export function drawPdfCopyrightFooter(pdf: PDFKit.PDFDocument, companyName: string | null | undefined) {
  if (!companyName) return;
  const savedX = pdf.x;
  const savedY = pdf.y;
  try {
    const text = `© ${new Date().getFullYear()} ${companyName}. All rights reserved.`;
    pdf.save();
    pdf.fontSize(8).fillColor("#98a2b3");
    pdf.text(text, 0, pdf.page.height - 28, { width: pdf.page.width, align: "center" });
    pdf.restore();
  } catch (err) {
    console.error("Failed to draw copyright footer in PDF export, continuing without it:", err);
  }
  pdf.x = savedX;
  pdf.y = savedY;
}

// docx counterpart of drawPdfCopyrightFooter — a repeating page Footer, same 8pt/gray treatment.
export function buildCopyrightFooter(companyName: string | null | undefined): Footer | undefined {
  if (!companyName) return undefined;
  const text = `© ${new Date().getFullYear()} ${companyName}. All rights reserved.`;
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text, size: 16, color: "98A2B3" })],
      }),
    ],
  });
}

export async function buildDocPdfBuffer(doc: ExportableDocument, watermark?: WatermarkAsset | null, companyName?: string | null): Promise<Buffer> {
  const blocks = sectionsToBlocks(doc.sections);
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    pdf.on("data", (chunk) => chunks.push(chunk));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);

    if (watermark) {
      drawPdfWatermark(pdf, watermark);
      pdf.on("pageAdded", () => drawPdfWatermark(pdf, watermark));
    }
    if (companyName) {
      drawPdfCopyrightFooter(pdf, companyName);
      pdf.on("pageAdded", () => drawPdfCopyrightFooter(pdf, companyName));
    }

    pdf.fontSize(20).fillColor("#101828").text(doc.title);
    pdf.fontSize(10).fillColor("#667085").text(`${doc.docType.replace(/_/g, " ")} · ${doc.category} · Updated ${doc.updatedAt.toLocaleDateString()}`);
    if (doc.summary) {
      pdf.moveDown(0.5).fontSize(11).fillColor("#344054").text(doc.summary, { italics: true } as any);
    }
    pdf.moveDown(1);

    for (const block of blocks) {
      pdf.fontSize(14).fillColor("#101828").text(block.heading);
      pdf.moveDown(0.3);
      pdf.fontSize(10.5).fillColor("#344054");
      for (const line of block.paragraphs) {
        pdf.text(line, { paragraphGap: 4 });
      }
      pdf.moveDown(0.8);
    }

    if (doc.tags.length) {
      pdf.fontSize(9).fillColor("#667085").text(`Tags: ${doc.tags.join(", ")}`);
    }
    pdf.end();
  });
}

// A Header renders on every page, so a floating behindDocument image placed inside one is the
// standard way to get a repeating "watermark" out of the docx library — there's no native
// alpha/washout knob exposed at this API level, so the image renders at full opacity; a light,
// mostly-transparent-background source logo (as opposed to a solid block of color) is what keeps
// this looking like a watermark rather than a stamp sitting on top of the text.
function buildWatermarkHeader(watermark: WatermarkAsset): Header {
  const maxW = 260;
  const maxH = 160;
  const scale = Math.min(maxW / watermark.width, maxH / watermark.height, 1);
  const horizontalAlign = watermark.position.endsWith("left")
    ? HorizontalPositionAlign.LEFT
    : watermark.position.endsWith("right")
      ? HorizontalPositionAlign.RIGHT
      : HorizontalPositionAlign.CENTER;
  const verticalAlign = watermark.position.startsWith("top")
    ? VerticalPositionAlign.TOP
    : watermark.position.startsWith("bottom")
      ? VerticalPositionAlign.BOTTOM
      : VerticalPositionAlign.CENTER;

  return new Header({
    children: [
      new Paragraph({
        children: [
          new ImageRun({
            type: watermark.docxType,
            data: watermark.buffer,
            transformation: { width: Math.round(watermark.width * scale), height: Math.round(watermark.height * scale) },
            floating: {
              horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, align: horizontalAlign },
              verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, align: verticalAlign },
              behindDocument: true,
              wrap: { type: TextWrappingType.NONE },
            },
          }),
        ],
      }),
    ],
  });
}

export async function buildDocDocxBuffer(doc: ExportableDocument, watermark?: WatermarkAsset | null, companyName?: string | null): Promise<Buffer> {
  const blocks = sectionsToBlocks(doc.sections);
  const children: Paragraph[] = [
    new Paragraph({ text: doc.title, heading: HeadingLevel.TITLE }),
    new Paragraph({
      children: [new TextRun({ text: `${doc.docType.replace(/_/g, " ")} · ${doc.category} · Updated ${doc.updatedAt.toLocaleDateString()}`, italics: true, color: "667085" })],
    }),
  ];
  if (doc.summary) children.push(new Paragraph({ text: doc.summary, spacing: { before: 200 } }));

  for (const block of blocks) {
    children.push(new Paragraph({ text: block.heading, heading: HeadingLevel.HEADING_2, spacing: { before: 300 } }));
    for (const line of block.paragraphs) {
      children.push(new Paragraph({ text: line }));
    }
  }
  if (doc.tags.length) {
    children.push(new Paragraph({ text: `Tags: ${doc.tags.join(", ")}`, spacing: { before: 300 } }));
  }

  // Same defensive posture as drawPdfWatermark: a watermark image docx's ImageRun can't parse
  // must degrade to "no watermark," never break the export.
  let watermarkHeader: Header | undefined;
  if (watermark) {
    try {
      watermarkHeader = buildWatermarkHeader(watermark);
    } catch (err) {
      console.error("Failed to build docs watermark header in Word export, continuing without it:", err);
    }
  }

  const footer = buildCopyrightFooter(companyName);

  const docx = new DocxDocument({
    sections: [{
      headers: watermarkHeader ? { default: watermarkHeader } : undefined,
      footers: footer ? { default: footer } : undefined,
      children,
    }],
  });
  return Packer.toBuffer(docx);
}

// Run on the VPS after `git pull` to bring Docs & SOPs content committed from another
// environment into this database. Counterpart to server/src/lib/docsGitSync.ts, which is what
// writes the files this script reads.
//
// Usage:  npm run docs:import -w server   (from the repo root)
//     or  tsx scripts/importDocsExport.ts (from server/)
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const EXPORT_DIR = path.join(__dirname, "..", "prisma", "docs-export");

interface DocExport {
  externalKey: string;
  title: string;
  docType: string;
  category: string;
  collectionName: string;
  summary: string | null;
  sections: unknown;
  tags: string[];
  isPublished: boolean;
  reviewDueDate: string | null;
  updatedAt: string;
}

// Mirrors docs.controller.ts's flattenToText/buildSearchText exactly, so an imported document's
// search ranking behaves identically to one created directly through the API.
function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ");
}
function flattenToText(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "string") return [stripHtml(value)];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(flattenToText);
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).flatMap(flattenToText);
  return [];
}
function buildSearchText(input: { title: string; summary: string | null; sections: unknown; tags: string[] }): string {
  return [input.title, input.summary ?? "", flattenToText(input.sections).join(" "), input.tags.join(" ")].join(" ");
}

async function main() {
  if (!fs.existsSync(EXPORT_DIR)) {
    console.log(`No export directory at ${EXPORT_DIR} — nothing to import.`);
    return;
  }

  const files = fs.readdirSync(EXPORT_DIR).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    console.log("No exported documents found — nothing to import.");
    return;
  }

  // Fallback author for documents that don't exist locally yet — prefers the default seeded
  // admin, else whichever Super Admin happens to exist on this database.
  const fallbackAuthor =
    (await prisma.user.findUnique({ where: { email: "subscriptions@kynren.com" } })) ??
    (await prisma.user.findFirst({ where: { role: { name: "Super Admin" } } }));
  if (!fallbackAuthor) {
    throw new Error("No admin user found on this database to attribute imported documents to.");
  }

  let created = 0;
  let updated = 0;

  for (const file of files) {
    const raw = fs.readFileSync(path.join(EXPORT_DIR, file), "utf8");
    const doc = JSON.parse(raw) as DocExport;

    const collection = await prisma.docCollection.upsert({
      where: { name: doc.collectionName },
      update: {},
      create: { name: doc.collectionName },
    });

    const searchText = buildSearchText({ title: doc.title, summary: doc.summary, sections: doc.sections, tags: doc.tags });
    const existing = await prisma.document.findUnique({ where: { externalKey: doc.externalKey } });

    const data = {
      title: doc.title,
      category: doc.category,
      collectionId: collection.id,
      summary: doc.summary,
      sections: doc.sections as any,
      tags: doc.tags,
      isPublished: doc.isPublished,
      reviewDueDate: doc.reviewDueDate ? new Date(doc.reviewDueDate) : null,
      searchText,
    };

    if (existing) {
      await prisma.document.update({ where: { id: existing.id }, data });
      updated += 1;
      console.log(`updated: ${doc.title}`);
    } else {
      await prisma.document.create({
        data: {
          ...data,
          externalKey: doc.externalKey,
          docType: doc.docType as any,
          createdById: fallbackAuthor.id,
        },
      });
      created += 1;
      console.log(`created: ${doc.title}`);
    }
  }

  console.log(`\nDone. Created ${created}, updated ${updated}, out of ${files.length} exported documents.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

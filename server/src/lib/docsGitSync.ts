import crypto from "crypto";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { prisma } from "../config/prisma";

const execFileAsync = promisify(execFile);

const REPO_ROOT = path.join(__dirname, "..", "..", "..");
const EXPORT_DIR = path.join(REPO_ROOT, "server", "prisma", "docs-export");
const RELATIVE_EXPORT_DIR = "server/prisma/docs-export";

// Every doc-git operation runs through this single queued chain so two saves landing close
// together can't run `git commit`/`git push` concurrently and trip over each other's index lock.
let gitQueue: Promise<void> = Promise.resolve();

async function runGit(args: string[]): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, { cwd: REPO_ROOT, timeout: 15000 });
    return { ok: true, output: stdout || stderr };
  } catch (err) {
    const message = (err as { stdout?: string; stderr?: string; message?: string }).stderr
      ?? (err as { message?: string }).message
      ?? String(err);
    return { ok: false, output: message };
  }
}

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

// Exports one document to a JSON file tracked in the repo, then commits and pushes it, so a
// `git pull` on the VPS (followed by `npm run docs:import -w server`) picks up the change. Every
// step is best-effort: a document save must never fail or hang because of a git/network problem,
// so this is always called fire-and-forget from the controller and only ever logs on failure.
export async function syncDocumentToGit(documentId: number, action: "create" | "update"): Promise<void> {
  gitQueue = gitQueue.then(() => syncOne(documentId, action)).catch((err) => {
    // eslint-disable-next-line no-console
    console.error(`[docsGitSync] failed for document ${documentId}:`, err);
  });
  return gitQueue;
}

async function syncOne(documentId: number, action: "create" | "update"): Promise<void> {
  const doc = await prisma.document.findUnique({ where: { id: documentId }, include: { collection: true } });
  if (!doc) return;

  let externalKey = doc.externalKey;
  if (!externalKey) {
    externalKey = crypto.randomUUID();
    await prisma.document.update({ where: { id: documentId }, data: { externalKey } });
  }

  const exportData: DocExport = {
    externalKey,
    title: doc.title,
    docType: doc.docType,
    category: doc.category,
    collectionName: doc.collection.name,
    summary: doc.summary,
    sections: doc.sections,
    tags: doc.tags,
    isPublished: doc.isPublished,
    reviewDueDate: doc.reviewDueDate ? doc.reviewDueDate.toISOString() : null,
    updatedAt: doc.updatedAt.toISOString(),
  };

  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  const filePath = path.join(EXPORT_DIR, `${externalKey}.json`);
  const relativeFilePath = `${RELATIVE_EXPORT_DIR}/${externalKey}.json`;
  fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2) + "\n", "utf8");

  const add = await runGit(["add", relativeFilePath]);
  if (!add.ok) {
    // eslint-disable-next-line no-console
    console.error(`[docsGitSync] git add failed for "${doc.title}":`, add.output);
    return;
  }

  const commitMessage = `docs: ${action} "${doc.title}"`;
  const commit = await runGit(["commit", "-m", commitMessage, "--", relativeFilePath]);
  if (!commit.ok) {
    // A clean "nothing to commit" (content unchanged since last export) is expected, not an error.
    if (!/nothing to commit/i.test(commit.output)) {
      // eslint-disable-next-line no-console
      console.error(`[docsGitSync] git commit failed for "${doc.title}":`, commit.output);
    }
    return;
  }

  const push = await runGit(["push"]);
  if (!push.ok) {
    // eslint-disable-next-line no-console
    console.error(`[docsGitSync] git push failed for "${doc.title}" — commit was made locally but not pushed:`, push.output);
  }
}

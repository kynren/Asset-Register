// One-off script: creates the "REST API Integration & Security" SOP directly via Prisma (not
// through docs.controller's create endpoint), so it does NOT trigger docsGitSync's immediate
// git add/commit/push. It still performs the *export* half of what docsGitSync does — assigning
// an externalKey and writing server/prisma/docs-export/<key>.json — so the file sits as a normal
// uncommitted change in the working tree and rides along with whatever `git push` ships this
// session's other work next, per the explicit "push it next time we're pushing" instruction.
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { prisma } from "../src/config/prisma";

const REPO_ROOT = path.join(__dirname, "..", "..");
const EXPORT_DIR = path.join(REPO_ROOT, "server", "prisma", "docs-export");

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

const sections = {
  purpose:
    "<p>This procedure covers the App Settings / System Settings <strong>API Connections</strong> feature, which lets an " +
    "external application authenticate against this app's REST API gateway and read or write this organization's data over " +
    "HTTPS, using an admin-issued credential rather than a user login.</p>",
  scope:
    "<p>Covers: issuing, using, and revoking an API Connection credential; the authentication scheme those credentials use; " +
    "and the resources currently reachable through the gateway.</p>" +
    "<p>As of this writing the gateway (<code>/api/integrations/v1/*</code>) exposes one resource family, " +
    "<strong>assets</strong> (GET list, GET by id, POST create, PUT full update, PATCH partial update, DELETE). Additional " +
    "resources are added by extending <code>server/src/modules/apiIntegrations/apiIntegrations.routes.ts</code> and become " +
    "selectable in the connection's <em>resources</em> list once wired up — they are not automatically granted to " +
    "existing connections.</p>" +
    "<p>Out of scope: the in-app MCP Connection (a separate credential type for AI tool integrations, e.g. Claude Desktop) " +
    "and the network relay agent's device key — both documented elsewhere.</p>",
  responsibilities:
    "<p>Only a <strong>System Admin</strong> or <strong>Super Admin</strong> (anyone holding the \"App Settings\" module's " +
    "create/edit/delete permissions) can issue, modify, or revoke an API Connection — the same gate that already " +
    "protects the rest of the App Settings / System Settings surface. The admin who creates a connection is responsible for " +
    "handing the secret to the integrator through a secure channel (e.g. a password manager share, not email or chat) and " +
    "for revoking it promptly if the integration is retired or the secret is suspected to have leaked.</p>",
  steps: [
    { step: "<p>In the app, go to <strong>App Settings → Integrations</strong> (or <strong>Admin & Setup → System Settings</strong> — the same API Connections card appears on both).</p>" },
    { step: "<p>Under \"New connection\", enter a descriptive name (e.g. the name of the external system), tick the HTTP verbs it needs (GET is on by default; only enable POST/PUT/PATCH/DELETE if the integration genuinely needs to write), then click <strong>Create Connection</strong>.</p>" },
    { step: "<p>Copy the <code>Authorization: Bearer &lt;apiKeyId&gt;.&lt;secret&gt;</code> value shown in the one-time banner immediately — it is never shown again, and the server never stores the secret in a form it could show you a second time.</p>" },
    { step: "<p>Hand that bearer token to the integrator over a secure channel. They send it as a single <code>Authorization</code> header on every request — no request-signing or extra headers required.</p>" },
    { step: "<p>The integrator calls <code>https://&lt;your-domain&gt;/api/integrations/v1/assets</code> (and <code>/assets/:id</code>) with standard GET/POST/PUT/PATCH/DELETE, exactly as documented in the \"Example request\" box on the API Connections card.</p>" },
    { step: "<p>To change what a connection can do, tick/untick its verb checkboxes in the list — changes take effect on the connection's next call, no new credential needed.</p>" },
    { step: "<p>To retire a connection, click <strong>Revoke</strong> (keeps the record for audit history) or the trash icon to delete it outright. A revoked or deleted connection's credential stops working immediately.</p>" },
    { step: "<p>If a secret is suspected to have leaked, revoke the connection immediately and create a new one — there is no way to rotate a secret in place, by design (issuing a fresh credential is simpler and safer than trying to invalidate one specific leaked value while keeping the rest of a shared secret's history trustworthy).</p>" },
  ],
  safetyNotes:
    "<p><strong>How the credential is protected:</strong></p>" +
    "<ul>" +
    "<li>The secret is 256 bits of random data, generated server-side. Only its SHA-256 hash is ever stored — a database " +
    "compromise alone cannot recover a usable credential.</li>" +
    "<li>Every gateway request is authenticated with a constant-time hash comparison, so response timing cannot be used to " +
    "guess the secret one byte at a time.</li>" +
    "<li>HTTPS is required in production — the gateway rejects plain-HTTP requests outright, so the credential is never " +
    "sent in the clear.</li>" +
    "<li>Each connection is rate-limited (120 requests/minute) to bound the damage a leaked or malfunctioning credential " +
    "can do before it's noticed and revoked.</li>" +
    "<li>Every call is scoped both by HTTP verb (per-connection GET/POST/PUT/PATCH/DELETE flags) and by resource family " +
    "(the connection's <code>resources</code> list) — a read-only integration should only ever be granted GET.</li>" +
    "<li>Every gateway call is written to the audit log (<code>external-api.&lt;verb&gt;</code>), and each connection " +
    "records its last-used timestamp and source IP, visible on the API Connections card.</li>" +
    "</ul>" +
    "<p>Treat a connection's bearer token exactly like a password: never commit it to source control, never paste it into " +
    "a chat channel, and grant only the verbs and resources the integration actually needs (least privilege).</p>",
  references:
    "<p>Admin UI: App Settings → Integrations, and Admin & Setup → System Settings (API Connections card).</p>" +
    "<p>Implementation: <code>server/src/modules/apiConnections/</code> (credential issuance) and " +
    "<code>server/src/modules/apiIntegrations/</code> (the gateway itself). Auth middleware: " +
    "<code>server/src/middleware/apiConnectionAuth.ts</code>.</p>" +
    "<p>Related: the MCP Connection card (same Integrations tab) documents the separate credential type used for AI-tool " +
    "integrations, not covered by this SOP.</p>",
};

async function main() {
  let collection = await prisma.docCollection.findUnique({ where: { name: "IT & Systems SOPs" } });
  if (!collection) {
    collection = await prisma.docCollection.create({
      data: { name: "IT & Systems SOPs", description: "Standard operating procedures for IT and computing systems administration." },
    });
  }

  const author = await prisma.user.findFirst({ where: { role: { name: "System Admin" } }, orderBy: { id: "asc" } });
  const fallbackAuthor = author ?? (await prisma.user.findFirst({ orderBy: { id: "asc" } }));
  if (!fallbackAuthor) throw new Error("No user found to attribute this document to.");

  const title = "REST API Integration & Security";
  const searchText = [title, "", flattenToText(sections).join(" "), ""].join(" ");

  const existing = await prisma.document.findFirst({ where: { title, collectionId: collection.id } });
  const doc = existing
    ? await prisma.document.update({
        where: { id: existing.id },
        data: { docType: "SOP", category: "IT & Computing Systems", sections, searchText, isPublished: true },
      })
    : await prisma.document.create({
        data: {
          title,
          docType: "SOP",
          category: "IT & Computing Systems",
          collectionId: collection.id,
          sections,
          tags: ["api", "integrations", "security"],
          searchText,
          isPublished: true,
          createdById: fallbackAuthor.id,
        },
      });

  let externalKey = doc.externalKey;
  if (!externalKey) {
    externalKey = crypto.randomUUID();
    await prisma.document.update({ where: { id: doc.id }, data: { externalKey } });
  }

  const exportData = {
    externalKey,
    title: doc.title,
    docType: doc.docType,
    category: doc.category,
    collectionName: collection.name,
    summary: doc.summary,
    sections: doc.sections,
    tags: doc.tags,
    isPublished: doc.isPublished,
    reviewDueDate: null,
    updatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(EXPORT_DIR, `${externalKey}.json`), JSON.stringify(exportData, null, 2) + "\n", "utf8");

  console.log(`SOP saved: Document #${doc.id} in collection "${collection.name}", exported to docs-export/${externalKey}.json`);
  console.log("Not committed/pushed to git — will go out with the next real push, per instruction.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());

/**
 * Polls a per-organization IMAP mailbox (configured under Admin & Setup -> Email Ingestion) and
 * turns each new message into a Ticket, the same way the existing schedulers in this file (see
 * backupScheduler.ts) tick every organization's tenant schema in turn via runForEachOrganization.
 * Mail polling doesn't need the 60s cadence the other schedulers use — every 120s is plenty.
 */
import fs from "fs";
import path from "path";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { prisma } from "../config/prisma";
import { runForEachOrganization } from "../config/controlPlane";
import { decryptSecret } from "./crypto";
import { computeDueAt } from "../modules/tickets/sla";

const POLL_INTERVAL_MS = 120 * 1000;
const UPLOAD_ROOT = path.join(__dirname, "..", "..", "uploads", "tickets");

async function nextTicketNumber(): Promise<string> {
  const count = await prisma.ticket.count();
  return `TCK-${String(count + 1).padStart(5, "0")}`;
}

async function resolveRequesterId(senderEmail: string | undefined, fallbackRequesterId: number | null): Promise<number | null> {
  if (senderEmail) {
    const user = await prisma.user.findUnique({ where: { email: senderEmail.toLowerCase() } });
    if (user) return user.id;
  }
  return fallbackRequesterId;
}

async function tick(): Promise<void> {
  const settings = await prisma.emailIngestSettings.findUnique({ where: { id: 1 } });
  if (!settings || !settings.isEnabled) return;
  if (!settings.imapHost || !settings.imapUser || !settings.imapPasswordEncrypted) return;

  const client = new ImapFlow({
    host: settings.imapHost,
    port: settings.imapPort ?? 993,
    secure: (settings.imapPort ?? 993) === 993,
    auth: { user: settings.imapUser, pass: decryptSecret(settings.imapPasswordEncrypted) },
    logger: false,
  });

  let maxUid = settings.lastUid ?? 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock(settings.mailbox);
    try {
      const range = settings.lastUid ? { uid: `${settings.lastUid + 1}:*` } : { seen: false };
      for await (const message of client.fetch(range, { uid: true, source: true })) {
        if (!message.source) continue;
        maxUid = Math.max(maxUid, message.uid);

        try {
          const parsed = await simpleParser(message.source);
          const senderEmail = parsed.from?.value?.[0]?.address;
          const requesterId = await resolveRequesterId(senderEmail, settings.fallbackRequesterId);
          if (!requesterId) {
            await prisma.emailIngestSettings.update({
              where: { id: 1 },
              data: { lastError: `Skipped message from ${senderEmail ?? "unknown sender"} — no matching user and no fallback requester configured.` },
            });
            continue;
          }

          const ticketNumber = await nextTicketNumber();
          const priority = "MEDIUM";
          const ticket = await prisma.ticket.create({
            data: {
              ticketNumber,
              title: (parsed.subject || "(no subject)").slice(0, 200),
              description: parsed.text || "(no message body)",
              type: "ACTION",
              priority,
              categoryId: settings.defaultCategoryId ?? undefined,
              requesterId,
              dueAt: computeDueAt(priority),
            },
          });

          for (const att of parsed.attachments) {
            const storedFilename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(att.filename || "")}`;
            fs.writeFileSync(path.join(UPLOAD_ROOT, storedFilename), att.content);
            await prisma.ticketAttachment.create({
              data: {
                ticketId: ticket.id,
                filename: att.filename || "attachment",
                storedPath: storedFilename,
                sizeBytes: att.size ?? att.content.length,
                uploadedById: requesterId,
              },
            });
          }
        } catch (perMessageErr) {
          // eslint-disable-next-line no-console
          console.error("Email ingestion: failed to process one message (continuing):", perMessageErr);
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();

    await prisma.emailIngestSettings.update({
      where: { id: 1 },
      data: { lastUid: maxUid, lastPolledAt: new Date(), lastError: null },
    });
  } catch (err) {
    await prisma.emailIngestSettings
      .update({ where: { id: 1 }, data: { lastError: err instanceof Error ? err.message : String(err) } })
      .catch(() => undefined);
    throw err;
  }
}

let intervalHandle: NodeJS.Timeout | null = null;

export function startEmailIngestScheduler() {
  if (intervalHandle) return;
  const run = () => {
    runForEachOrganization(tick).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Email ingest scheduler tick failed:", err);
    });
  };
  run();
  intervalHandle = setInterval(run, POLL_INTERVAL_MS);
  intervalHandle.unref();
}

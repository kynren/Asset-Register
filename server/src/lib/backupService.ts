import { spawn } from "child_process";
import { createReadStream } from "fs";
import { mkdtemp, rm, stat } from "fs/promises";
import os from "os";
import path from "path";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../config/env";
import { decryptSecret } from "./crypto";
import { sendEmail } from "./email";

interface DumpResult {
  ok: boolean;
  filePath?: string;
  fileName?: string;
  sizeBytes?: number;
  error?: string;
}

// Custom format (-Fc) rather than plain SQL: it's compressed, and restorable/selectively
// restorable with pg_restore, which is the format Postgres itself recommends for anything beyond
// a quick eyeball-able dump. Shells out to the real pg_dump binary rather than hand-rolling a
// schema+data exporter — a partial reimplementation is exactly the kind of thing that silently
// produces an unrestorable "backup", which is worse than no backup at all.
export async function runPgDump(): Promise<DumpResult> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "kynren-backup-"));
  const fileName = `kynren-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.dump`;
  const filePath = path.join(dir, fileName);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: DumpResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let proc;
    try {
      proc = spawn("pg_dump", ["--format=custom", `--dbname=${env.DATABASE_URL}`, `--file=${filePath}`], {
        stdio: ["ignore", "ignore", "pipe"],
      });
    } catch (err) {
      finish({ ok: false, error: err instanceof Error ? err.message : String(err) });
      return;
    }

    let stderr = "";
    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err: NodeJS.ErrnoException) => {
      finish({
        ok: false,
        error:
          err.code === "ENOENT"
            ? "pg_dump binary not found on this server. Install the postgresql-client package matching your Postgres version."
            : err.message,
      });
    });
    proc.on("exit", async (code) => {
      if (code !== 0) {
        finish({ ok: false, error: stderr.trim() || `pg_dump exited with code ${code}` });
        return;
      }
      try {
        const info = await stat(filePath);
        finish({ ok: true, filePath, fileName, sizeBytes: info.size });
      } catch {
        finish({ ok: false, error: "pg_dump reported success but no output file was produced." });
      }
    });
  });
}

export async function cleanupDump(filePath: string): Promise<void> {
  await rm(path.dirname(filePath), { recursive: true, force: true }).catch(() => undefined);
}

interface DestinationLike {
  type: "EMAIL" | "S3";
  emailTo: string | null;
  s3Endpoint: string | null;
  s3Region: string | null;
  s3Bucket: string | null;
  s3AccessKeyId: string | null;
  s3SecretAccessKey: string | null;
  s3PathPrefix: string | null;
  s3ForcePathStyle: boolean;
}

function s3ClientFor(dest: DestinationLike): S3Client {
  return new S3Client({
    region: dest.s3Region || "us-east-1",
    endpoint: dest.s3Endpoint || undefined,
    forcePathStyle: dest.s3ForcePathStyle,
    credentials: {
      accessKeyId: dest.s3AccessKeyId ?? "",
      secretAccessKey: dest.s3SecretAccessKey ? decryptSecret(dest.s3SecretAccessKey) : "",
    },
  });
}

function s3Key(dest: DestinationLike, fileName: string): string {
  const prefix = (dest.s3PathPrefix ?? "").replace(/^\/+|\/+$/g, "");
  return prefix ? `${prefix}/${fileName}` : fileName;
}

// Pushes an already-produced dump file to one destination — called once per enabled destination
// per run, independently, so one bad destination (wrong bucket, expired SMTP creds) never stops
// delivery to the others.
export async function deliverToDestination(
  destination: DestinationLike,
  filePath: string,
  meta: { fileName: string; sizeBytes: number }
): Promise<{ ok: boolean; message: string }> {
  if (destination.type === "EMAIL") {
    if (!destination.emailTo) return { ok: false, message: "No recipient email configured." };
    const sizeMb = (meta.sizeBytes / (1024 * 1024)).toFixed(2);
    const result = await sendEmail({
      to: destination.emailTo,
      subject: `Kynren Asset Register — database backup (${new Date().toLocaleDateString()})`,
      text: `Database backup attached (${sizeMb} MB). Restore with: pg_restore --clean --dbname=<url> ${meta.fileName}`,
      attachments: [{ filename: meta.fileName, path: filePath }],
    });
    return result.delivered ? { ok: true, message: "Emailed successfully." } : { ok: false, message: "SMTP is not configured on this server — email was not sent." };
  }

  if (destination.type === "S3") {
    if (!destination.s3Bucket) return { ok: false, message: "No bucket configured." };
    try {
      const client = s3ClientFor(destination);
      const key = s3Key(destination, meta.fileName);
      await client.send(
        new PutObjectCommand({
          Bucket: destination.s3Bucket,
          Key: key,
          Body: createReadStream(filePath),
          ContentLength: meta.sizeBytes,
        })
      );
      return { ok: true, message: `Uploaded to s3://${destination.s3Bucket}/${key}` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  return { ok: false, message: "Unknown destination type." };
}

// Proves the destination actually works before it's ever relied on for a real backup — for S3
// this means writing and then deleting a small real object (a reachable-but-read-only bucket, or
// a key policy that blocks PutObject, would otherwise look "connected" right up until the first
// real backup silently fails to land).
export async function testDestinationConnection(destination: DestinationLike): Promise<{ ok: boolean; message: string }> {
  if (destination.type === "EMAIL") {
    if (!destination.emailTo) return { ok: false, message: "No recipient email configured." };
    const result = await sendEmail({
      to: destination.emailTo,
      subject: "Kynren Asset Register — backup destination test",
      text: "This is a test message confirming this email address can receive database backup deliveries.",
    });
    return result.delivered
      ? { ok: true, message: "Test email sent." }
      : { ok: false, message: "SMTP is not configured on this server — configure SMTP (see Email Templates) before testing." };
  }

  if (destination.type === "S3") {
    if (!destination.s3Bucket || !destination.s3AccessKeyId || !destination.s3SecretAccessKey) {
      return { ok: false, message: "Bucket, access key ID, and secret access key are all required." };
    }
    const key = s3Key(destination, ".kynren-connection-test");
    try {
      const client = s3ClientFor(destination);
      await client.send(new PutObjectCommand({ Bucket: destination.s3Bucket, Key: key, Body: "Kynren Asset Register connection test" }));
      await client.send(new DeleteObjectCommand({ Bucket: destination.s3Bucket, Key: key }));
      return { ok: true, message: "Connected — successfully wrote and deleted a test object in the bucket." };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  return { ok: false, message: "Unknown destination type." };
}

import nodemailer, { Transporter } from "nodemailer";
import { env } from "../config/env";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; path: string }[];
}

let transporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;

  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 587,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    });
  } else {
    transporter = null;
  }

  return transporter;
}

/**
 * Sends a real email when SMTP credentials are configured. Otherwise, logs the full
 * message to the server console/logs — this keeps every email-triggered flow (password
 * reset, alerts) fully functional and testable without fabricating delivery, and starts
 * working for real the moment SMTP_HOST/SMTP_USER/SMTP_PASSWORD are set in the environment.
 */
export async function sendEmail(message: EmailMessage): Promise<{ delivered: boolean }> {
  const client = getTransporter();

  if (!client) {
    // eslint-disable-next-line no-console
    console.log(
      `\n[EMAIL NOT SENT — SMTP not configured]\nTo: ${message.to}\nSubject: ${message.subject}\n---\n${message.text}\n---\n`
    );
    return { delivered: false };
  }

  await client.sendMail({
    from: env.SMTP_FROM,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    attachments: message.attachments,
  });
  return { delivered: true };
}

// Used by the System Status health check (see lib/systemStatusMonitor.ts) — distinguishes "SMTP
// isn't configured" (expected/degraded, sendEmail already falls back to console logging) from
// "SMTP is configured but the server can't actually reach/auth to it" (a real outage) by asking
// nodemailer to open and verify the connection without sending anything.
export async function verifyEmailTransport(): Promise<{ configured: boolean; ok: boolean; error?: string }> {
  const client = getTransporter();
  if (!client) return { configured: false, ok: false };
  try {
    await client.verify();
    return { configured: true, ok: true };
  } catch (err) {
    return { configured: true, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

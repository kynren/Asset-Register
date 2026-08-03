import { EmailEventType } from "@prisma/client";
import { prisma } from "../config/prisma";
import { sendEmail } from "./email";
import { EmailBlock, renderEmailTemplate } from "./emailTemplateRenderer";

interface EventEmailInput {
  eventType: EmailEventType;
  to: string;
  variables: Record<string, string>;
  fallbackSubject: string;
  fallbackText: string;
}

// Every event-triggered email (account created, asset assigned, overdue task, low stock,
// password reset) goes through here. If an admin has activated a template for this eventType in
// Admin & Setup, it's rendered and used; otherwise falls back to a plain built-in message so the
// notification still goes out even before anyone's designed a template for it.
export async function sendEventEmail({ eventType, to, variables, fallbackSubject, fallbackText }: EventEmailInput): Promise<void> {
  const template = await prisma.emailTemplate.findFirst({ where: { eventType, isActive: true } });

  if (!template) {
    await sendEmail({ to, subject: fallbackSubject, text: fallbackText, eventType });
    return;
  }

  const { subject, html } = renderEmailTemplate(template.subject, template.blocks as unknown as EmailBlock[], variables);
  await sendEmail({ to, subject, text: fallbackText, html, eventType });
}

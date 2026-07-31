import { Request, Response } from "express";
import { EmailEventType } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { sendEmail } from "../../lib/email";
import { EmailBlock, renderEmailTemplate } from "../../lib/emailTemplateRenderer";

export async function list(req: Request, res: Response) {
  const eventType = req.query.eventType as EmailEventType | undefined;
  const templates = await prisma.emailTemplate.findMany({
    where: eventType ? { eventType } : undefined,
    include: { createdBy: { select: { firstName: true, lastName: true } } },
    orderBy: [{ eventType: "asc" }, { updatedAt: "desc" }],
  });
  res.json(templates);
}

export async function getOne(req: Request, res: Response) {
  const template = await prisma.emailTemplate.findUnique({ where: { id: Number(req.params.id) } });
  if (!template) throw new ApiError(404, "Email template not found");
  res.json(template);
}

export async function create(req: Request, res: Response) {
  const template = await prisma.emailTemplate.create({
    data: { ...req.body, createdById: req.user!.id },
  });
  await logAudit({ userId: req.user!.id, action: "emailTemplate.create", entityType: "EmailTemplate", entityId: template.id });
  res.status(201).json(template);
}

export async function update(req: Request, res: Response) {
  const id = Number(req.params.id);
  const template = await prisma.emailTemplate.update({ where: { id }, data: req.body });
  await logAudit({ userId: req.user!.id, action: "emailTemplate.update", entityType: "EmailTemplate", entityId: id });
  res.json(template);
}

export async function remove(req: Request, res: Response) {
  const id = Number(req.params.id);
  await prisma.emailTemplate.delete({ where: { id } });
  await logAudit({ userId: req.user!.id, action: "emailTemplate.delete", entityType: "EmailTemplate", entityId: id });
  res.json({ ok: true });
}

// Only one template per eventType is ever active — activating this one deactivates any other
// template already active for the same event, so "assign to an event" behaves like a radio
// button rather than admins having to remember to turn the old one off themselves.
export async function activate(req: Request, res: Response) {
  const id = Number(req.params.id);
  const template = await prisma.emailTemplate.findUnique({ where: { id } });
  if (!template) throw new ApiError(404, "Email template not found");

  const [, updated] = await prisma.$transaction([
    prisma.emailTemplate.updateMany({ where: { eventType: template.eventType, id: { not: id } }, data: { isActive: false } }),
    prisma.emailTemplate.update({ where: { id }, data: { isActive: true } }),
  ]);

  await logAudit({ userId: req.user!.id, action: "emailTemplate.activate", entityType: "EmailTemplate", entityId: id });
  res.json(updated);
}

export async function deactivate(req: Request, res: Response) {
  const id = Number(req.params.id);
  const template = await prisma.emailTemplate.update({ where: { id }, data: { isActive: false } });
  await logAudit({ userId: req.user!.id, action: "emailTemplate.deactivate", entityType: "EmailTemplate", entityId: id });
  res.json(template);
}

export async function uploadImage(req: Request, res: Response) {
  if (!req.file) throw new ApiError(400, "No file uploaded");
  res.status(201).json({ url: `/uploads/email-templates/${req.file.filename}` });
}

// Realistic placeholder values so a template can be previewed in a real inbox before it's
// actually wired to a live event — never sent as a real notification, just a preview render.
const SAMPLE_VARIABLES: Record<EmailEventType, Record<string, string>> = {
  ACCOUNT_CREATED: { firstName: "Jordan", lastName: "Ellis", email: "jordan.ellis@example.com", tempPassword: "Sample!2025", loginUrl: "https://app-assets.kynren.com/login" },
  ASSET_ASSIGNED: { firstName: "Jordan", assetName: "Dell Latitude 5440", assetTag: "KYN-0142", assetUrl: "https://app-assets.kynren.com/assets/142" },
  PASSWORD_RESET: { firstName: "Jordan", resetUrl: "https://app-assets.kynren.com/reset-password/sample-token" },
  TASK_OVERDUE: { firstName: "Jordan", taskType: "Asset Checkout", taskName: "Dell Latitude 5440 (KYN-0142)", dueDate: "12 Jul 2026", taskUrl: "https://app-assets.kynren.com/assets/142" },
  LOW_STOCK: { itemName: "HDMI Cable 2m", quantityOnHand: "3", reorderLevel: "10", stockUrl: "https://app-assets.kynren.com/stock" },
  DEVICE_OFFLINE: { deviceName: "core-switch-01 (192.168.1.10)", ipAddress: "192.168.1.10", deviceType: "Network Switching / Routing", sinceTime: "12 Jul 2026, 14:32", monitorUrl: "https://app-assets.kynren.com/network" },
  DEVICE_ONLINE: { deviceName: "core-switch-01 (192.168.1.10)", ipAddress: "192.168.1.10", deviceType: "Network Switching / Routing", sinceTime: "12 Jul 2026, 14:47", monitorUrl: "https://app-assets.kynren.com/network" },
};

export async function sendTest(req: Request, res: Response) {
  const id = Number(req.params.id);
  const template = await prisma.emailTemplate.findUnique({ where: { id } });
  if (!template) throw new ApiError(404, "Email template not found");

  const variables = SAMPLE_VARIABLES[template.eventType];
  const { subject, html } = renderEmailTemplate(template.subject, template.blocks as unknown as EmailBlock[], variables);
  await sendEmail({ to: req.body.to, subject: `[TEST] ${subject}`, text: "This is a test send of an email template — view the HTML version to see the real design.", html });

  res.json({ ok: true });
}

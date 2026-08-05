import { EmailEventType, NotificationEventKind } from "@prisma/client";
import { prisma } from "../config/prisma";
import { sendEventEmail } from "./emailNotify";
import { sendPushToUsers } from "./pushNotify";

interface NotifyInput {
  userIds: number[];
  excludeUserId?: number;
  type: string;
  message: string;
  linkUrl?: string;
  // Optional: when set, each recipient's NotificationPreference row for this kind gates whether
  // they get the in-app row and/or the email (missing row = enabled, per the opt-out model) —
  // omit for notification types that don't have a matching NotificationEventKind, which keeps
  // today's unconditional behavior.
  kind?: NotificationEventKind;
  // Optional: also dispatch an event-driven email (template if the admin configured one for this
  // eventType, otherwise a plain fallback) to the same recipients as the in-app notification.
  // `variables` can be a flat object shared by every recipient, or a function so callers with
  // per-recipient context (e.g. different asset per assignee) can vary it.
  email?: {
    eventType: EmailEventType;
    fallbackSubject: string;
    fallbackText: string | ((userId: number) => string);
    variables: Record<string, string> | ((userId: number) => Record<string, string>);
  };
}

export async function notifyUsers({ userIds, excludeUserId, type, message, linkUrl, kind, email }: NotifyInput) {
  const recipients = [...new Set(userIds)].filter((id) => id !== excludeUserId);
  if (recipients.length === 0) return;

  let inAppRecipients = recipients;
  let emailRecipients = recipients;

  if (kind) {
    const prefs = await prisma.notificationPreference.findMany({ where: { userId: { in: recipients }, kind } });
    const prefByUser = new Map(prefs.map((p) => [p.userId, p]));
    inAppRecipients = recipients.filter((id) => prefByUser.get(id)?.inAppEnabled ?? true);
    emailRecipients = recipients.filter((id) => prefByUser.get(id)?.emailEnabled ?? true);
  }

  if (inAppRecipients.length > 0) {
    await prisma.notification.createMany({
      data: inAppRecipients.map((userId) => ({ userId, type, message, linkUrl })),
    });
    // Push mirrors the in-app feed 1:1 — same recipient list, same "kind" opt-out gate — rather
    // than being a separately configurable channel. Fire-and-forget: never block the caller on
    // Expo's push service being slow or unreachable.
    void sendPushToUsers(inAppRecipients, { title: type, body: message, data: linkUrl ? { linkUrl } : undefined });
  }

  if (!email || emailRecipients.length === 0) return;

  const users = await prisma.user.findMany({ where: { id: { in: emailRecipients } }, select: { id: true, email: true, firstName: true, lastName: true } });
  await Promise.all(
    users.map((u) =>
      sendEventEmail({
        eventType: email.eventType,
        to: u.email,
        // firstName/lastName are always available so callers don't each have to re-fetch the
        // recipient's name just to greet them — caller-supplied variables win on key collision.
        variables: {
          firstName: u.firstName,
          lastName: u.lastName,
          ...(typeof email.variables === "function" ? email.variables(u.id) : email.variables),
        },
        fallbackSubject: email.fallbackSubject,
        fallbackText: typeof email.fallbackText === "function" ? email.fallbackText(u.id) : email.fallbackText,
      })
    )
  );
}

// Resolves the user IDs whose role grants a given module/action permission — used to notify
// e.g. everyone who can edit stock, rather than a single fixed recipient.
export async function getUserIdsWithPermission(module: string, action: "canView" | "canCreate" | "canEdit" | "canDelete" | "canExport"): Promise<number[]> {
  const users = await prisma.user.findMany({
    where: { isActive: true, role: { permissions: { some: { module, [action]: true } } } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

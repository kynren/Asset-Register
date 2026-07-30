import { EmailEventType } from "@prisma/client";
import { prisma } from "../config/prisma";
import { sendEventEmail } from "./emailNotify";

interface NotifyInput {
  userIds: number[];
  excludeUserId?: number;
  type: string;
  message: string;
  linkUrl?: string;
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

export async function notifyUsers({ userIds, excludeUserId, type, message, linkUrl, email }: NotifyInput) {
  const recipients = [...new Set(userIds)].filter((id) => id !== excludeUserId);
  if (recipients.length === 0) return;

  await prisma.notification.createMany({
    data: recipients.map((userId) => ({ userId, type, message, linkUrl })),
  });

  if (!email) return;

  const users = await prisma.user.findMany({ where: { id: { in: recipients } }, select: { id: true, email: true, firstName: true, lastName: true } });
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

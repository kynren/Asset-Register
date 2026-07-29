import { prisma } from "../config/prisma";

interface NotifyInput {
  userIds: number[];
  excludeUserId?: number;
  type: string;
  message: string;
  linkUrl?: string;
}

export async function notifyUsers({ userIds, excludeUserId, type, message, linkUrl }: NotifyInput) {
  const recipients = [...new Set(userIds)].filter((id) => id !== excludeUserId);
  if (recipients.length === 0) return;

  await prisma.notification.createMany({
    data: recipients.map((userId) => ({ userId, type, message, linkUrl })),
  });
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

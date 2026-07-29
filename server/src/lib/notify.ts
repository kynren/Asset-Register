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

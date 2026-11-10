import type { NotificationType } from "@/generated/prisma/enums";
import { prisma, type DbClient } from "@/server/db/prisma";
import { emitOutbox } from "@/server/audit";
import { ApiError } from "@/server/errors";

export type NotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  resourceType: string;
  resourceId: string;
  href: string;
};

/**
 * Creates an in-app notification inside the caller's transaction and emits an outbox
 * event so the email transport can deliver asynchronously after commit.
 */
export async function createNotification(db: DbClient, input: NotificationInput) {
  const n = await db.notification.create({ data: { ...input, body: input.body ?? null } });
  await emitOutbox(db, "notification.created", n.id, { notificationId: n.id, userId: input.userId, type: input.type });
  return n;
}

export async function notifyMany(db: DbClient, userIds: string[], input: Omit<NotificationInput, "userId">) {
  const unique = Array.from(new Set(userIds));
  for (const userId of unique) await createNotification(db, { ...input, userId });
}

/** Users who review for a project: org owners/managers/editors plus project managers/editors. */
export async function reviewerUserIds(db: DbClient, projectId: string, excludeUserId?: string): Promise<string[]> {
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId }, select: { organizationId: true } });
  const [org, proj] = await Promise.all([
    db.organizationMember.findMany({
      where: { organizationId: project.organizationId, role: { in: ["OWNER", "MANAGER", "EDITOR"] } },
      select: { userId: true },
    }),
    db.projectMember.findMany({ where: { projectId, role: { in: ["MANAGER", "EDITOR"] } }, select: { userId: true } }),
  ]);
  return [...org, ...proj].map((m) => m.userId).filter((id) => id !== excludeUserId);
}

export async function listNotifications(userId: string, opts: { unreadOnly?: boolean; limit?: number } = {}) {
  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take: Math.min(opts.limit ?? 50, 100),
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { items, unreadCount };
}

export async function markNotificationRead(userId: string, id: string, read = true) {
  const n = await prisma.notification.findUnique({ where: { id } });
  if (!n || n.userId !== userId) throw ApiError.notFound("Notification not found");
  return prisma.notification.update({ where: { id }, data: { readAt: read ? new Date() : null } });
}

export async function markAllRead(userId: string) {
  await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}

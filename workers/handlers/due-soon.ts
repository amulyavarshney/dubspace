import { prisma } from "@/server/db/prisma";
import { createNotification } from "@/server/services/notifications";
import { registerJobHandler } from "@/server/queue/worker";

/** Notifies actors about assignments due within 24 hours (once per assignment). */
export async function notifyDueSoon(): Promise<number> {
  const soon = new Date(Date.now() + 24 * 3600 * 1000);
  const assignments = await prisma.assignment.findMany({
    where: { active: true, dueAt: { lte: soon, gte: new Date() }, segment: { status: { in: ["ASSIGNED", "CHANGES_REQUESTED", "REOPENED"] } } },
    include: { segment: { include: { languageTrack: { include: { video: { select: { projectId: true } } } } } } },
  });
  let n = 0;
  for (const a of assignments) {
    const exists = await prisma.notification.findFirst({ where: { userId: a.actorUserId, type: "DUE_SOON", resourceType: "Assignment", resourceId: a.id } });
    if (exists) continue;
    await createNotification(prisma, {
      userId: a.actorUserId,
      type: "DUE_SOON",
      title: "Recording due soon",
      body: a.segment.script.slice(0, 140),
      resourceType: "Assignment",
      resourceId: a.id,
      href: `/projects/${a.segment.languageTrack.video.projectId}/segments/${a.segmentId}`,
    });
    n++;
  }
  return n;
}

registerJobHandler("notifications.due-soon", async () => {
  await notifyDueSoon();
});

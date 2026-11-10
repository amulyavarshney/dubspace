import { prisma } from "@/server/db/prisma";
import { isOverdue } from "./transitions";

export async function listMyAssignments(userId: string) {
  const assignments = await prisma.assignment.findMany({
    where: { actorUserId: userId, active: true },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    include: {
      segment: {
        include: {
          languageTrack: { include: { video: { include: { project: { select: { id: true, name: true } } } } } },
          currentVersion: { select: { id: true, versionNumber: true, processingStatus: true, createdAt: true, decisions: { orderBy: { createdAt: "desc" }, take: 1 } } },
        },
      },
    },
  });
  const now = new Date();
  return assignments.map((a) => ({
    id: a.id,
    dueAt: a.dueAt,
    overdue: isOverdue(a.dueAt, a.segment.status, now),
    segment: {
      id: a.segment.id,
      externalId: a.segment.externalId,
      script: a.segment.script,
      status: a.segment.status,
      startMs: a.segment.startMs,
      endMs: a.segment.endMs,
      locale: a.segment.languageTrack.locale,
      language: a.segment.languageTrack.displayName,
      video: { id: a.segment.languageTrack.video.id, title: a.segment.languageTrack.video.title },
      project: a.segment.languageTrack.video.project,
      currentVersion: a.segment.currentVersion,
      latestDecision: a.segment.currentVersion?.decisions[0] ?? null,
    },
  }));
}

import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/audit";
import { ApiError } from "@/server/errors";
import { can } from "@/server/authorization/policy";
import { requireRecordingAccess } from "@/server/authorization/access";
import { createNotification, reviewerUserIds } from "./notifications";

export async function addComment(input: { userId: string; recordingVersionId: string; timestampMs: number; body: string; parentId?: string }) {
  const access = await requireRecordingAccess(input.userId, input.recordingVersionId);
  if (!can.comment(access.level)) throw ApiError.forbidden();
  const body = input.body.trim();
  if (!body) throw ApiError.validation("Comment cannot be empty");
  if (body.length > 4000) throw ApiError.validation("Comment is too long");
  if (input.timestampMs < 0) throw ApiError.validation("Timestamp must be positive");
  const rv = await prisma.recordingVersion.findUniqueOrThrow({ where: { id: input.recordingVersionId }, include: { segment: true } });
  if (rv.durationMs && input.timestampMs > rv.durationMs + 1000) throw ApiError.validation("Timestamp is beyond the end of the recording");
  if (input.parentId) {
    const parent = await prisma.comment.findUnique({ where: { id: input.parentId } });
    if (!parent || parent.recordingVersionId !== rv.id) throw ApiError.validation("Invalid parent comment");
  }

  return prisma.$transaction(async (tx) => {
    const comment = await tx.comment.create({
      data: { recordingVersionId: rv.id, authorId: input.userId, timestampMs: Math.round(input.timestampMs), body, parentId: input.parentId ?? null },
      include: { author: { select: { id: true, name: true } } },
    });
    await tx.segment.update({ where: { id: rv.segmentId }, data: { lastActivityAt: new Date() } });
    await recordAudit(tx, { organizationId: access.organizationId, actorId: input.userId, action: "comment.created", entityType: "Comment", entityId: comment.id, metadata: { projectId: access.projectId, segmentId: rv.segmentId, versionNumber: rv.versionNumber, timestampMs: comment.timestampMs } });
    // Notify the other side of the conversation.
    const assignment = await tx.assignment.findFirst({ where: { segmentId: rv.segmentId, active: true } });
    const href = `/projects/${access.projectId}/segments/${rv.segmentId}?version=${rv.id}&comment=${comment.id}`;
    if (access.level === "ACTOR") {
      const reviewers = await reviewerUserIds(tx, access.projectId, input.userId);
      for (const uid of reviewers.slice(0, 20)) {
        await createNotification(tx, { userId: uid, type: "SUBMISSION_READY", title: "Actor replied to feedback", body: body.slice(0, 140), resourceType: "Comment", resourceId: comment.id, href });
      }
    } else if (assignment && assignment.actorUserId !== input.userId) {
      await createNotification(tx, { userId: assignment.actorUserId, type: "REVISION_REQUESTED", title: `New feedback at ${formatMs(comment.timestampMs)}`, body: body.slice(0, 140), resourceType: "Comment", resourceId: comment.id, href });
    }
    return comment;
  });
}

export async function updateComment(input: { userId: string; commentId: string; body?: string; resolved?: boolean }) {
  const comment = await prisma.comment.findUnique({ where: { id: input.commentId }, include: { recordingVersion: { select: { segmentId: true, versionNumber: true } } } });
  if (!comment) throw ApiError.notFound("Comment not found");
  const access = await requireRecordingAccess(input.userId, comment.recordingVersionId);

  const data: { body?: string; editedAt?: Date; resolvedAt?: Date | null; resolvedById?: string | null } = {};
  if (input.body !== undefined) {
    if (comment.authorId !== input.userId) throw ApiError.forbidden("You can only edit your own comments");
    if (comment.resolvedAt) throw ApiError.invalidState("Resolved comments cannot be edited");
    const body = input.body.trim();
    if (!body) throw ApiError.validation("Comment cannot be empty");
    data.body = body;
    data.editedAt = new Date();
  }
  if (input.resolved !== undefined) {
    // Reviewers, the author, or the active assignee may resolve/reopen.
    const isAssignee = access.isActiveAssignee;
    if (!can.review(access.level) && comment.authorId !== input.userId && !isAssignee) throw ApiError.forbidden();
    data.resolvedAt = input.resolved ? new Date() : null;
    data.resolvedById = input.resolved ? input.userId : null;
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.comment.update({ where: { id: comment.id }, data, include: { author: { select: { id: true, name: true } } } });
    await recordAudit(tx, {
      organizationId: access.organizationId,
      actorId: input.userId,
      action: input.resolved === true ? "comment.resolved" : input.resolved === false ? "comment.reopened" : "comment.edited",
      entityType: "Comment",
      entityId: comment.id,
      metadata: { projectId: access.projectId, segmentId: comment.recordingVersion.segmentId, versionNumber: comment.recordingVersion.versionNumber },
    });
    return updated;
  });
}

export function formatMs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

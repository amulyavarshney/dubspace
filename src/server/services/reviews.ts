import type { ReviewDecisionType, SegmentStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { recordAudit, emitOutbox } from "@/server/audit";
import { ApiError } from "@/server/errors";
import { can } from "@/server/authorization/policy";
import { requireRecordingAccess } from "@/server/authorization/access";
import { createNotification } from "./notifications";
import { canTransition } from "./transitions";

export type ReviewInput = {
  userId: string;
  recordingVersionId: string;
  decision: ReviewDecisionType;
  reason?: string;
  expectedSegmentRevision: number;
};

/**
 * Records an authoritative review decision. Runs in one transaction with an optimistic
 * revision check so two concurrent reviewers cannot silently overwrite each other.
 */
export async function submitReview(input: ReviewInput) {
  const access = await requireRecordingAccess(input.userId, input.recordingVersionId);
  if (!can.review(access.level)) throw ApiError.forbidden("Only editors and managers can review recordings");
  const reason = input.reason?.trim();
  if ((input.decision === "CHANGES_REQUESTED" || input.decision === "REOPENED") && !reason) {
    throw ApiError.validation("A reason is required when requesting changes or reopening");
  }

  return prisma.$transaction(async (tx) => {
    const rv = await tx.recordingVersion.findUniqueOrThrow({ where: { id: input.recordingVersionId }, include: { segment: true } });
    const segment = rv.segment;
    if (segment.revision !== input.expectedSegmentRevision) throw ApiError.stale();

    let nextStatus: SegmentStatus;
    if (input.decision === "REOPENED") {
      if (segment.status !== "APPROVED") throw ApiError.invalidState("Only approved segments can be reopened");
      if (segment.approvedVersionId !== rv.id) throw ApiError.invalidState("This is not the approved version");
      nextStatus = "REOPENED";
    } else {
      if (rv.processingStatus !== "READY") throw ApiError.invalidState("Only processed recordings can be reviewed");
      if (segment.currentVersionId !== rv.id) throw ApiError.stale("A newer version has been submitted. Review the latest version instead.");
      nextStatus = input.decision === "APPROVED" ? "APPROVED" : "CHANGES_REQUESTED";
      if (!canTransition(segment.status, nextStatus)) {
        throw ApiError.invalidState(`Cannot ${input.decision === "APPROVED" ? "approve" : "request changes"} while the segment is ${segment.status.toLowerCase().replace("_", " ")}`);
      }
    }

    const decision = await tx.reviewDecision.create({ data: { recordingVersionId: rv.id, reviewerId: input.userId, decision: input.decision, reason: reason || null } });
    const updated = await tx.segment.updateMany({
      where: { id: segment.id, revision: input.expectedSegmentRevision },
      data: {
        status: nextStatus,
        approvedVersionId: input.decision === "APPROVED" ? rv.id : input.decision === "REOPENED" ? null : segment.approvedVersionId,
        revision: { increment: 1 },
        lastActivityAt: new Date(),
      },
    });
    if (updated.count !== 1) throw ApiError.stale();

    const action = input.decision === "APPROVED" ? "recording.approved" : input.decision === "REOPENED" ? "segment.reopened" : "revision.requested";
    await recordAudit(tx, { organizationId: access.organizationId, actorId: input.userId, action, entityType: "RecordingVersion", entityId: rv.id, metadata: { projectId: access.projectId, segmentId: segment.id, versionNumber: rv.versionNumber, decision: input.decision, reason: reason ?? null } });
    await emitOutbox(tx, action.replace(".", "_"), rv.id, { recordingVersionId: rv.id, segmentId: segment.id, projectId: access.projectId, decision: input.decision });

    const assignment = await tx.assignment.findFirst({ where: { segmentId: segment.id, active: true } });
    if (assignment && assignment.actorUserId !== input.userId) {
      await createNotification(tx, {
        userId: assignment.actorUserId,
        type: input.decision === "APPROVED" ? "APPROVED" : "REVISION_REQUESTED",
        title: input.decision === "APPROVED" ? `Version ${rv.versionNumber} approved` : input.decision === "REOPENED" ? "Segment reopened" : `Changes requested on version ${rv.versionNumber}`,
        body: reason ?? segment.script.slice(0, 140),
        resourceType: "Segment",
        resourceId: segment.id,
        href: `/projects/${access.projectId}/segments/${segment.id}`,
      });
    }
    return { decision, segmentStatus: nextStatus, segmentRevision: segment.revision + 1 };
  });
}

/** Marks a submitted segment as in review (first reviewer interaction). */
export async function startReview(userId: string, recordingVersionId: string) {
  const access = await requireRecordingAccess(userId, recordingVersionId);
  if (!can.review(access.level)) return null;
  const rv = await prisma.recordingVersion.findUniqueOrThrow({ where: { id: recordingVersionId }, include: { segment: true } });
  if (rv.segment.status !== "SUBMITTED" || rv.segment.currentVersionId !== rv.id || rv.processingStatus !== "READY") return null;
  return prisma.$transaction(async (tx) => {
    const res = await tx.segment.updateMany({ where: { id: rv.segmentId, status: "SUBMITTED" }, data: { status: "IN_REVIEW", revision: { increment: 1 }, lastActivityAt: new Date() } });
    if (res.count === 1) {
      await recordAudit(tx, { organizationId: access.organizationId, actorId: userId, action: "review.started", entityType: "Segment", entityId: rv.segmentId, metadata: { projectId: access.projectId, segmentId: rv.segmentId, versionNumber: rv.versionNumber } });
    }
    return tx.segment.findUniqueOrThrow({ where: { id: rv.segmentId }, select: { status: true, revision: true } });
  });
}

import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/audit";
import { ApiError } from "@/server/errors";
import { can } from "@/server/authorization/policy";
import { requireProjectAccess, requireSegmentAccess, type SegmentAccess } from "@/server/authorization/access";
import { createNotification } from "./notifications";
import { canUploadInStatus, isOverdue, isReviewable } from "./transitions";

export async function getSegmentDetail(userId: string, segmentId: string) {
  const access = await requireSegmentAccess(userId, segmentId);
  const segment = await prisma.segment.findUniqueOrThrow({
    where: { id: segmentId },
    include: {
      languageTrack: { include: { video: { include: { project: { select: { id: true, name: true, organizationId: true, sourceLocale: true } } } } } },
      assignments: { orderBy: { createdAt: "desc" }, include: { actor: { select: { id: true, name: true, email: true } } } },
      versions: {
        orderBy: { versionNumber: "desc" },
        include: {
          uploader: { select: { id: true, name: true } },
          decisions: { orderBy: { createdAt: "desc" }, include: { reviewer: { select: { id: true, name: true } } } },
          comments: { orderBy: [{ timestampMs: "asc" }, { createdAt: "asc" }], include: { author: { select: { id: true, name: true } } } },
          generationJob: { select: { id: true, providerId: true, modelId: true, voiceId: true, voiceName: true, status: true } },
        },
      },
      jobs: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  const activeAssignment = segment.assignments.find((a) => a.active) ?? null;
  const current = segment.versions.find((v) => v.id === segment.currentVersionId) ?? null;
  const permissions = {
    canReview: can.review(access.level) && isReviewable(segment.status, current?.processingStatus),
    canReopen: can.review(access.level) && segment.status === "APPROVED",
    canUpload: can.upload(access.level) && canUploadInStatus(segment.status) && (access.level !== "ACTOR" || access.isActiveAssignee),
    canComment: can.comment(access.level),
    canAssign: can.assign(access.level),
    canGenerateAi: can.generateAi(access.level) && canUploadInStatus(segment.status),
    accessLevel: access.level,
  };
  return {
    access,
    permissions,
    segment: {
      id: segment.id,
      externalId: segment.externalId,
      script: segment.script,
      notes: segment.notes,
      startMs: segment.startMs,
      endMs: segment.endMs,
      required: segment.required,
      status: segment.status,
      revision: segment.revision,
      currentVersionId: segment.currentVersionId,
      approvedVersionId: segment.approvedVersionId,
      lastActivityAt: segment.lastActivityAt,
      locale: segment.languageTrack.locale,
      language: segment.languageTrack.displayName,
      video: { id: segment.languageTrack.video.id, title: segment.languageTrack.video.title, referenceUrl: segment.languageTrack.video.referenceUrl },
      project: segment.languageTrack.video.project,
      activeAssignment: activeAssignment ? { id: activeAssignment.id, actor: activeAssignment.actor, dueAt: activeAssignment.dueAt, overdue: isOverdue(activeAssignment.dueAt, segment.status) } : null,
      assignments: segment.assignments,
      versions: segment.versions.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        origin: v.origin,
        mimeType: v.mimeType,
        originalFilename: v.originalFilename,
        sizeBytes: v.sizeBytes,
        durationMs: v.durationMs,
        peaks: v.peaks as number[] | null,
        processingStatus: v.processingStatus,
        processingError: v.processingError,
        createdAt: v.createdAt,
        uploader: v.uploader,
        decisions: v.decisions,
        comments: v.comments,
        generation: v.generationJob,
        isCurrent: v.id === segment.currentVersionId,
        isApproved: v.id === segment.approvedVersionId,
      })),
      generationJobs: segment.jobs,
    },
  };
}

export async function assignActor(input: { userId: string; segmentId: string; actorUserId: string | null; dueAt?: Date | null }) {
  const access = await requireSegmentAccess(input.userId, input.segmentId);
  if (!can.assign(access.level)) throw ApiError.forbidden("Only managers can assign actors");
  if (input.actorUserId) {
    const member = await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: access.organizationId, userId: input.actorUserId } } });
    if (!member) throw ApiError.validation("Actor must be a member of this organization");
  }
  return prisma.$transaction(async (tx) => {
    const segment = await tx.segment.findUniqueOrThrow({ where: { id: input.segmentId } });
    await tx.assignment.updateMany({ where: { segmentId: segment.id, active: true }, data: { active: false, deactivatedAt: new Date() } });
    let assignment = null;
    if (input.actorUserId) {
      assignment = await tx.assignment.create({ data: { segmentId: segment.id, actorUserId: input.actorUserId, dueAt: input.dueAt ?? null, assignedById: input.userId } });
      // Make sure actors who are not org-level collaborators can at least see the project.
      await tx.projectMember.upsert({
        where: { projectId_userId: { projectId: access.projectId, userId: input.actorUserId } },
        update: {},
        create: { projectId: access.projectId, userId: input.actorUserId, role: "ACTOR" },
      });
      await createNotification(tx, {
        userId: input.actorUserId,
        type: "ASSIGNMENT_CREATED",
        title: "New recording assignment",
        body: segment.script.slice(0, 140),
        resourceType: "Segment",
        resourceId: segment.id,
        href: `/projects/${access.projectId}/segments/${segment.id}`,
      });
    }
    const nextStatus = segment.status === "UNASSIGNED" && input.actorUserId ? "ASSIGNED" : segment.status === "ASSIGNED" && !input.actorUserId ? "UNASSIGNED" : segment.status;
    const updated = await tx.segment.update({ where: { id: segment.id }, data: { status: nextStatus, revision: { increment: 1 }, lastActivityAt: new Date() } });
    await recordAudit(tx, {
      organizationId: access.organizationId,
      actorId: input.userId,
      action: input.actorUserId ? "assignment.created" : "assignment.removed",
      entityType: "Segment",
      entityId: segment.id,
      metadata: { projectId: access.projectId, segmentId: segment.id, actorUserId: input.actorUserId, dueAt: input.dueAt?.toISOString() ?? null },
    });
    return { assignment, segment: updated };
  });
}

export async function updateSegment(userId: string, segmentId: string, patch: { script?: string; notes?: string | null; required?: boolean; startMs?: number; endMs?: number; externalId?: string | null }) {
  const access = await requireSegmentAccess(userId, segmentId);
  if (!can.manageProject(access.level)) throw ApiError.forbidden();
  if (patch.startMs !== undefined && patch.endMs !== undefined && patch.endMs <= patch.startMs) throw ApiError.validation("endMs must be greater than startMs");
  return prisma.$transaction(async (tx) => {
    const seg = await tx.segment.update({ where: { id: segmentId }, data: { ...patch, revision: { increment: 1 }, lastActivityAt: new Date() } });
    await recordAudit(tx, { organizationId: access.organizationId, actorId: userId, action: "segment.updated", entityType: "Segment", entityId: segmentId, metadata: { projectId: access.projectId, segmentId, fields: Object.keys(patch) } });
    return seg;
  });
}

export async function createSegment(userId: string, projectId: string, input: { videoId: string; locale: string; startMs: number; endMs: number; script: string; externalId?: string; notes?: string; required?: boolean }) {
  const access = await requireProjectAccess(userId, projectId, "FULL");
  if (input.startMs < 0 || input.endMs <= input.startMs) throw ApiError.validation("Invalid timestamps");
  const video = await prisma.video.findFirst({ where: { id: input.videoId, projectId } });
  if (!video) throw ApiError.notFound("Video not found");
  return prisma.$transaction(async (tx) => {
    const track = await tx.languageTrack.upsert({
      where: { videoId_locale: { videoId: video.id, locale: input.locale } },
      update: {},
      create: { videoId: video.id, locale: input.locale, displayName: input.locale },
    });
    const seg = await tx.segment.create({ data: { languageTrackId: track.id, startMs: input.startMs, endMs: input.endMs, script: input.script, externalId: input.externalId || null, notes: input.notes || null, required: input.required ?? true } });
    await recordAudit(tx, { organizationId: access.organizationId, actorId: userId, action: "segment.created", entityType: "Segment", entityId: seg.id, metadata: { projectId, segmentId: seg.id } });
    return seg;
  });
}

export async function getSegmentActivity(userId: string, segmentId: string) {
  const access: SegmentAccess = await requireSegmentAccess(userId, segmentId);
  const events = await prisma.auditEvent.findMany({
    where: { organizationId: access.organizationId, metadata: { path: ["segmentId"], equals: segmentId } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const actorIds = Array.from(new Set(events.map((e) => e.actorId).filter((x): x is string => !!x)));
  const users = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : [];
  const names = new Map(users.map((u) => [u.id, u.name]));
  return events.map((e) => ({ id: e.id, action: e.action, createdAt: e.createdAt, actorName: e.actorId ? (names.get(e.actorId) ?? "System") : "System", metadata: e.metadata }));
}

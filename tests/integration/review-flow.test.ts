import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { ApiError } from "@/server/errors";
import { assignActor, getSegmentDetail } from "@/server/services/segments";
import { completeUpload, createUploadIntent, getPlaybackUrl } from "@/server/services/recordings";
import { submitReview } from "@/server/services/reviews";
import { addComment, updateComment } from "@/server/services/comments";
import { getStorage } from "@/server/storage";
import { synthWav } from "@/server/providers/mock/adapter";
import { drainJobs } from "@/server/queue/worker";
import { listMyAssignments } from "@/server/services/assignments";
import { getProjectOverview } from "@/server/services/projects";
import { addMember, createOrgWithOwner, createProjectWithSegment, resetDatabase } from "../helpers/db";
import "../../workers/register";

async function uploadVersion(userId: string, segmentId: string, seconds = 2) {
  const wav = synthWav({ seconds, freq: 220, words: 4 });
  const intent = await createUploadIntent({ userId, segmentId, filename: "take.wav", mimeType: "audio/wav", sizeBytes: wav.byteLength });
  // Simulate the browser PUT to the signed URL by writing the object directly.
  const key = (await prisma.recordingVersion.findUniqueOrThrow({ where: { id: intent.recordingVersionId } })).objectKey;
  await getStorage().putObject(key, wav, "audio/wav");
  await completeUpload(userId, intent.recordingVersionId);
  await drainJobs("test");
  return prisma.recordingVersion.findUniqueOrThrow({ where: { id: intent.recordingVersionId } });
}

describe("end-to-end review workflow (services + worker)", () => {
  let ownerId: string;
  let orgId: string;
  let editor: { id: string };
  let actor: { id: string };
  let segmentId: string;
  let projectId: string;

  beforeAll(async () => {
    await resetDatabase();
    const { org, owner } = await createOrgWithOwner();
    orgId = org.id;
    ownerId = owner.id;
    editor = await addMember(org.id, "EDITOR");
    actor = await addMember(org.id, "ACTOR");
    const created = await createProjectWithSegment(org.id, owner.id);
    segmentId = created.segment.id;
    projectId = created.project.id;
  });

  it("assigns an actor, notifies them, and exposes the assignment", async () => {
    const res = await assignActor({ userId: ownerId, segmentId, actorUserId: actor.id, dueAt: new Date(Date.now() + 86400000) });
    expect(res.segment.status).toBe("ASSIGNED");
    const mine = await listMyAssignments(actor.id);
    expect(mine).toHaveLength(1);
    const n = await prisma.notification.findFirst({ where: { userId: actor.id, type: "ASSIGNMENT_CREATED" } });
    expect(n).not.toBeNull();
  });

  it("rejects uploads from non-assignees and unsupported types", async () => {
    const stranger = await addMember(orgId, "ACTOR", "stranger");
    await expect(createUploadIntent({ userId: stranger.id, segmentId, filename: "x.wav", mimeType: "audio/wav", sizeBytes: 10 })).rejects.toMatchObject({ status: 404 });
    await expect(createUploadIntent({ userId: actor.id, segmentId, filename: "x.mov", mimeType: "video/quicktime", sizeBytes: 10 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("processes an upload into a READY version and moves the segment to SUBMITTED", async () => {
    const rv = await uploadVersion(actor.id, segmentId);
    expect(rv.processingStatus).toBe("READY");
    expect(rv.versionNumber).toBe(1);
    const seg = await prisma.segment.findUniqueOrThrow({ where: { id: segmentId } });
    expect(seg.status).toBe("SUBMITTED");
    expect(seg.currentVersionId).toBe(rv.id);
    const notif = await prisma.notification.findFirst({ where: { userId: editor.id, type: "SUBMISSION_READY" } });
    expect(notif).not.toBeNull();
    const playback = await getPlaybackUrl(editor.id, rv.id);
    expect(playback.url).toContain("/api/v1/local-storage/");
  });

  it("lets the editor comment at a timestamp and the actor resolve it, but not approve", async () => {
    const seg = await prisma.segment.findUniqueOrThrow({ where: { id: segmentId } });
    const comment = await addComment({ userId: editor.id, recordingVersionId: seg.currentVersionId!, timestampMs: 1200, body: "Too fast here" });
    expect(comment.timestampMs).toBe(1200);
    const resolved = await updateComment({ userId: actor.id, commentId: comment.id, resolved: true });
    expect(resolved.resolvedAt).not.toBeNull();
    await expect(submitReview({ userId: actor.id, recordingVersionId: seg.currentVersionId!, decision: "APPROVED", expectedSegmentRevision: seg.revision })).rejects.toMatchObject({ status: 403 });
  });

  it("requires a reason for revision requests and records the decision", async () => {
    const seg = await prisma.segment.findUniqueOrThrow({ where: { id: segmentId } });
    await expect(submitReview({ userId: editor.id, recordingVersionId: seg.currentVersionId!, decision: "CHANGES_REQUESTED", expectedSegmentRevision: seg.revision })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const res = await submitReview({ userId: editor.id, recordingVersionId: seg.currentVersionId!, decision: "CHANGES_REQUESTED", reason: "Redo the second phrase", expectedSegmentRevision: seg.revision });
    expect(res.segmentStatus).toBe("CHANGES_REQUESTED");
    const after = await prisma.segment.findUniqueOrThrow({ where: { id: segmentId } });
    expect(after.revision).toBe(seg.revision + 1);
    expect(await prisma.notification.count({ where: { userId: actor.id, type: "REVISION_REQUESTED" } })).toBeGreaterThan(0);
    expect(await prisma.auditEvent.count({ where: { action: "revision.requested" } })).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { type: "revision_requested" } })).toBe(1);
  });

  it("keeps v1 feedback historical when v2 is submitted, then approves v2 with concurrency protection", async () => {
    const v2 = await uploadVersion(actor.id, segmentId, 3);
    expect(v2.versionNumber).toBe(2);
    const detail = await getSegmentDetail(editor.id, segmentId);
    expect(detail.segment.status).toBe("SUBMITTED");
    const v1 = detail.segment.versions.find((v) => v.versionNumber === 1)!;
    expect(v1.comments).toHaveLength(1);
    expect(detail.segment.versions.find((v) => v.versionNumber === 2)!.comments).toHaveLength(0);

    const seg = await prisma.segment.findUniqueOrThrow({ where: { id: segmentId } });
    // Stale decision against v1 is rejected.
    await expect(submitReview({ userId: editor.id, recordingVersionId: v1.id, decision: "APPROVED", expectedSegmentRevision: seg.revision })).rejects.toMatchObject({ code: "STALE_REVISION" });
    // Stale revision number is rejected.
    await expect(submitReview({ userId: editor.id, recordingVersionId: v2.id, decision: "APPROVED", expectedSegmentRevision: seg.revision - 1 })).rejects.toMatchObject({ code: "STALE_REVISION" });

    // Two concurrent approvals: exactly one wins.
    const results = await Promise.allSettled([
      submitReview({ userId: editor.id, recordingVersionId: v2.id, decision: "APPROVED", expectedSegmentRevision: seg.revision }),
      submitReview({ userId: ownerId, recordingVersionId: v2.id, decision: "APPROVED", expectedSegmentRevision: seg.revision }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected" && (r.reason as ApiError).code === "STALE_REVISION")).toHaveLength(1);

    const final = await prisma.segment.findUniqueOrThrow({ where: { id: segmentId } });
    expect(final.status).toBe("APPROVED");
    expect(final.approvedVersionId).toBe(v2.id);
    expect(await prisma.reviewDecision.count({ where: { recordingVersionId: v2.id, decision: "APPROVED" } })).toBe(1);
  });

  it("reflects approval in the dashboard and blocks uploads until reopened", async () => {
    const overview = await getProjectOverview(ownerId, projectId);
    expect(overview.progress.approvedPercentage).toBe(100);
    await expect(createUploadIntent({ userId: actor.id, segmentId, filename: "x.wav", mimeType: "audio/wav", sizeBytes: 100 })).rejects.toMatchObject({ code: "INVALID_STATE" });
    const seg = await prisma.segment.findUniqueOrThrow({ where: { id: segmentId } });
    const reopened = await submitReview({ userId: editor.id, recordingVersionId: seg.approvedVersionId!, decision: "REOPENED", reason: "Client changed the line", expectedSegmentRevision: seg.revision });
    expect(reopened.segmentStatus).toBe("REOPENED");
    expect((await getProjectOverview(ownerId, projectId)).progress.approvedPercentage).toBe(0);
  });
});

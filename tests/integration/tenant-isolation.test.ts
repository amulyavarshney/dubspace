import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { getProject, listProjectsForUser, listProjectSegments } from "@/server/services/projects";
import { getSegmentDetail } from "@/server/services/segments";
import { createUploadIntent, getPlaybackUrl } from "@/server/services/recordings";
import { addComment } from "@/server/services/comments";
import { listProviderConfigs, saveProviderCredential } from "@/server/services/ai-providers";
import { listNotifications, markNotificationRead } from "@/server/services/notifications";
import { addMember, createOrgWithOwner, createProjectWithSegment, resetDatabase } from "../helpers/db";

describe("cross-tenant isolation", () => {
  let a: Awaited<ReturnType<typeof createOrgWithOwner>>;
  let b: Awaited<ReturnType<typeof createOrgWithOwner>>;
  let segA: string;
  let projectA: string;
  let recordingA: string;

  beforeAll(async () => {
    await resetDatabase();
    a = await createOrgWithOwner();
    b = await createOrgWithOwner();
    const created = await createProjectWithSegment(a.org.id, a.owner.id);
    segA = created.segment.id;
    projectA = created.project.id;
    const rv = await prisma.recordingVersion.create({ data: { segmentId: segA, versionNumber: 1, objectKey: `org/${a.org.id}/segments/${segA}/x.wav`, mimeType: "audio/wav", processingStatus: "READY" } });
    recordingA = rv.id;
    await prisma.segment.update({ where: { id: segA }, data: { currentVersionId: rv.id, status: "SUBMITTED" } });
  });

  it("hides other tenants' projects and segments (404, not 403)", async () => {
    expect(await listProjectsForUser(b.owner.id, b.org.id)).toHaveLength(0);
    expect(await listProjectsForUser(b.owner.id, a.org.id)).toHaveLength(0);
    await expect(getProject(b.owner.id, projectA)).rejects.toMatchObject({ status: 404 });
    await expect(listProjectSegments(b.owner.id, projectA, {})).rejects.toMatchObject({ status: 404 });
    await expect(getSegmentDetail(b.owner.id, segA)).rejects.toMatchObject({ status: 404 });
  });

  it("refuses media URLs, uploads and comments across tenants", async () => {
    await expect(getPlaybackUrl(b.owner.id, recordingA)).rejects.toMatchObject({ status: 404 });
    await expect(createUploadIntent({ userId: b.owner.id, segmentId: segA, filename: "x.wav", mimeType: "audio/wav", sizeBytes: 1 })).rejects.toMatchObject({ status: 404 });
    await expect(addComment({ userId: b.owner.id, recordingVersionId: recordingA, timestampMs: 0, body: "hi" })).rejects.toMatchObject({ status: 404 });
  });

  it("actors only see segments they are assigned to", async () => {
    const actor = await addMember(a.org.id, "ACTOR");
    await expect(getSegmentDetail(actor.id, segA)).rejects.toMatchObject({ status: 404 });
    await prisma.assignment.create({ data: { segmentId: segA, actorUserId: actor.id, assignedById: a.owner.id } });
    await prisma.projectMember.create({ data: { projectId: projectA, userId: actor.id, role: "ACTOR" } });
    const detail = await getSegmentDetail(actor.id, segA);
    expect(detail.permissions.canReview).toBe(false);
    expect(detail.permissions.canGenerateAi).toBe(false);
    expect(detail.permissions.canUpload).toBe(true);
    const list = await listProjectSegments(actor.id, projectA, {});
    expect(list.items).toHaveLength(1);
  });

  it("keeps provider credentials per organization and owner-only", async () => {
    await saveProviderCredential({ userId: a.owner.id, organizationId: a.org.id, providerId: "mock", secret: "mock-tenant-a-key" });
    const viewB = await listProviderConfigs(b.owner.id, b.org.id);
    expect(viewB.find((p) => p.providerId === "mock")?.configured).toBe(false);
    await expect(listProviderConfigs(b.owner.id, a.org.id)).rejects.toMatchObject({ status: 404 });
    const manager = await addMember(a.org.id, "MANAGER");
    await expect(saveProviderCredential({ userId: manager.id, organizationId: a.org.id, providerId: "mock", secret: "mock-x" })).rejects.toMatchObject({ status: 403 });
  });

  it("notifications are private to their recipient", async () => {
    const n = await prisma.notification.create({ data: { userId: a.owner.id, type: "APPROVED", title: "t", resourceType: "Segment", resourceId: segA, href: "/x" } });
    expect((await listNotifications(b.owner.id)).items).toHaveLength(0);
    await expect(markNotificationRead(b.owner.id, n.id)).rejects.toMatchObject({ status: 404 });
  });
});

import type { OrgRole, ProjectRole } from "@/generated/prisma/enums";
import { prisma, type DbClient } from "@/server/db/prisma";
import { ApiError } from "@/server/errors";
import { can, resolveProjectAccess, type AccessLevel } from "./policy";

export type ProjectAccess = {
  projectId: string;
  organizationId: string;
  orgRole: OrgRole | null;
  projectRole: ProjectRole | null;
  level: AccessLevel;
};

export async function getOrgRole(db: DbClient, userId: string, organizationId: string): Promise<OrgRole | null> {
  const m = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { role: true },
  });
  return m?.role ?? null;
}

export async function requireOrgRole(userId: string, organizationId: string): Promise<OrgRole> {
  const role = await getOrgRole(prisma, userId, organizationId);
  if (!role) throw ApiError.notFound();
  return role;
}

export async function requireOrgOwner(userId: string, organizationId: string): Promise<void> {
  const role = await requireOrgRole(userId, organizationId);
  if (!can.manageOrganization(role)) throw ApiError.forbidden("Only organization owners can do this");
}

export async function getProjectAccess(userId: string, projectId: string, db: DbClient = prisma): Promise<ProjectAccess | null> {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true, organizationId: true } });
  if (!project) return null;
  const [orgRole, membership] = await Promise.all([
    getOrgRole(db, userId, project.organizationId),
    db.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } }, select: { role: true } }),
  ]);
  const level = resolveProjectAccess(orgRole, membership?.role ?? null);
  return { projectId, organizationId: project.organizationId, orgRole, projectRole: membership?.role ?? null, level };
}

/** 404 (not 403) when the caller is not allowed to know the project exists. */
export async function requireProjectAccess(userId: string, projectId: string, minimum: AccessLevel = "ACTOR"): Promise<ProjectAccess> {
  const access = await getProjectAccess(userId, projectId);
  if (!access || access.level === "NONE") throw ApiError.notFound("Project not found");
  const rank: Record<AccessLevel, number> = { NONE: 0, ACTOR: 1, REVIEW: 2, FULL: 3 };
  if (rank[access.level] < rank[minimum]) throw ApiError.forbidden();
  return access;
}

export type SegmentAccess = ProjectAccess & {
  segmentId: string;
  /** True when the caller is the active assignee. */
  isActiveAssignee: boolean;
  /** True when the caller has ever been assigned (historical visibility). */
  isAssignee: boolean;
};

export async function getSegmentAccess(userId: string, segmentId: string): Promise<SegmentAccess | null> {
  const segment = await prisma.segment.findUnique({
    where: { id: segmentId },
    select: {
      id: true,
      languageTrack: { select: { video: { select: { projectId: true } } } },
      assignments: { where: { actorUserId: userId }, select: { active: true } },
    },
  });
  if (!segment) return null;
  const projectId = segment.languageTrack.video.projectId;
  const access = await getProjectAccess(userId, projectId);
  if (!access) return null;
  const isAssignee = segment.assignments.length > 0;
  const isActiveAssignee = segment.assignments.some((a) => a.active);
  if (access.level === "ACTOR" && !isAssignee) return { ...access, level: "NONE", segmentId, isAssignee, isActiveAssignee };
  return { ...access, segmentId, isAssignee, isActiveAssignee };
}

export async function requireSegmentAccess(userId: string, segmentId: string): Promise<SegmentAccess> {
  const access = await getSegmentAccess(userId, segmentId);
  if (!access || access.level === "NONE") throw ApiError.notFound("Segment not found");
  return access;
}

export async function requireRecordingAccess(userId: string, recordingVersionId: string) {
  const rv = await prisma.recordingVersion.findUnique({ where: { id: recordingVersionId }, select: { id: true, segmentId: true } });
  if (!rv) throw ApiError.notFound("Recording not found");
  const access = await requireSegmentAccess(userId, rv.segmentId);
  return { recordingVersionId: rv.id, ...access };
}

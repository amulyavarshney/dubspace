import type { Prisma } from "@/generated/prisma/client";
import type { SegmentStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/audit";
import { ApiError } from "@/server/errors";
import { can } from "@/server/authorization/policy";
import { getOrgRole, requireProjectAccess, type ProjectAccess } from "@/server/authorization/access";
import { computeProgress, isOverdue } from "./transitions";
import { createNotification } from "./notifications";
import { displayLanguageName, normalizeLocale } from "@/lib/locale";

export type CreateProjectInput = {
  name: string;
  description?: string;
  deadline?: Date | null;
  sourceLocale?: string;
  videos?: Array<{ title: string; referenceUrl?: string }>;
  targetLocales?: string[];
};

export async function createProject(userId: string, organizationId: string, input: CreateProjectInput) {
  const role = await getOrgRole(prisma, userId, organizationId);
  if (!role) throw ApiError.notFound();
  if (!can.createProject(role)) throw ApiError.forbidden("Only owners and managers can create projects");
  const name = input.name.trim();
  if (name.length < 2) throw ApiError.validation("Project name must be at least 2 characters");

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        organizationId,
        name,
        description: input.description?.trim() || null,
        deadline: input.deadline ?? null,
        sourceLocale: normalizeLocale(input.sourceLocale ?? "en") ?? "en",
        createdById: userId,
      },
    });
    const locales = Array.from(new Set((input.targetLocales ?? []).map((l) => normalizeLocale(l)).filter((l): l is string => !!l)));
    const videos = (input.videos ?? []).filter((v) => v.title.trim());
    for (const [i, v] of videos.entries()) {
      const video = await tx.video.create({ data: { projectId: project.id, title: v.title.trim(), referenceUrl: v.referenceUrl?.trim() || null, sortOrder: i } });
      for (const locale of locales) {
        await tx.languageTrack.create({ data: { videoId: video.id, locale, displayName: displayLanguageName(locale) } });
      }
    }
    await recordAudit(tx, { organizationId, actorId: userId, action: "project.created", entityType: "Project", entityId: project.id, metadata: { name } });
    return project;
  });
}

export type ProjectListItem = {
  id: string;
  name: string;
  description: string | null;
  deadline: Date | null;
  sourceLocale: string;
  updatedAt: Date;
  access: ProjectAccess["level"];
  progress: ReturnType<typeof computeProgress>;
  overdue: number;
  languages: string[];
};

export async function listProjectsForUser(userId: string, organizationId: string): Promise<ProjectListItem[]> {
  const orgRole = await getOrgRole(prisma, userId, organizationId);
  if (!orgRole) return [];
  const where: Prisma.ProjectWhereInput = { organizationId };
  if (orgRole === "ACTOR") {
    where.OR = [
      { members: { some: { userId } } },
      { videos: { some: { tracks: { some: { segments: { some: { assignments: { some: { actorUserId: userId } } } } } } } } },
    ];
  }
  const projects = await prisma.project.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      members: { where: { userId }, select: { role: true } },
      videos: {
        select: {
          tracks: {
            select: {
              locale: true,
              segments: {
                select: { status: true, required: true, assignments: { where: { active: true }, select: { dueAt: true }, take: 1 } },
                ...(orgRole === "ACTOR" ? { where: { assignments: { some: { actorUserId: userId } } } } : {}),
              },
            },
          },
        },
      },
    },
  });
  const now = new Date();
  return projects.map((p) => {
    const segments = p.videos.flatMap((v) => v.tracks.flatMap((t) => t.segments));
    const level = orgRole === "ACTOR" ? (p.members[0]?.role === "MANAGER" ? "FULL" : p.members[0]?.role === "EDITOR" ? "REVIEW" : "ACTOR") : orgRole === "EDITOR" ? (p.members[0]?.role === "MANAGER" ? "FULL" : "REVIEW") : "FULL";
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      deadline: p.deadline,
      sourceLocale: p.sourceLocale,
      updatedAt: p.updatedAt,
      access: level,
      progress: computeProgress(segments),
      overdue: segments.filter((s) => isOverdue(s.assignments[0]?.dueAt, s.status, now)).length,
      languages: Array.from(new Set(p.videos.flatMap((v) => v.tracks.map((t) => t.locale)))),
    };
  });
}

export async function getProject(userId: string, projectId: string) {
  const access = await requireProjectAccess(userId, projectId);
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { organization: { select: { id: true, name: true } }, videos: { orderBy: { sortOrder: "asc" }, include: { tracks: { orderBy: { locale: "asc" } } } } },
  });
  return { project, access };
}

export type ProjectOverview = {
  progress: ReturnType<typeof computeProgress>;
  overdue: number;
  languages: Array<{ locale: string; displayName: string; progress: ReturnType<typeof computeProgress>; overdue: number }>;
  videos: Array<{ id: string; title: string; segmentCount: number }>;
  recentActivity: Array<{ id: string; action: string; entityType: string; entityId: string; actorName: string | null; createdAt: Date; metadata: unknown }>;
  teamSize: number;
};

export async function getProjectOverview(userId: string, projectId: string): Promise<ProjectOverview> {
  const access = await requireProjectAccess(userId, projectId);
  const segmentWhere: Prisma.SegmentWhereInput = { languageTrack: { video: { projectId } } };
  if (access.level === "ACTOR") segmentWhere.assignments = { some: { actorUserId: userId } };
  const segments = await prisma.segment.findMany({
    where: segmentWhere,
    select: { status: true, required: true, languageTrack: { select: { locale: true, displayName: true, videoId: true } }, assignments: { where: { active: true }, select: { dueAt: true }, take: 1 } },
  });
  const now = new Date();
  const byLocale = new Map<string, { displayName: string; segs: typeof segments }>();
  for (const s of segments) {
    const entry = byLocale.get(s.languageTrack.locale) ?? { displayName: s.languageTrack.displayName, segs: [] };
    entry.segs.push(s);
    byLocale.set(s.languageTrack.locale, entry);
  }
  const videos = await prisma.video.findMany({ where: { projectId }, orderBy: { sortOrder: "asc" }, select: { id: true, title: true, tracks: { select: { _count: { select: { segments: true } } } } } });
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { organizationId: true } });
  const audits = access.level === "ACTOR" ? [] : await prisma.auditEvent.findMany({
    where: { organizationId: project.organizationId, metadata: { path: ["projectId"], equals: projectId } },
    orderBy: { createdAt: "desc" },
    take: 15,
  });
  const actorIds = Array.from(new Set(audits.map((a) => a.actorId).filter((x): x is string => !!x)));
  const actors = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : [];
  const nameOf = new Map(actors.map((a) => [a.id, a.name]));
  const teamSize = await prisma.projectMember.count({ where: { projectId } });
  return {
    progress: computeProgress(segments),
    overdue: segments.filter((s) => isOverdue(s.assignments[0]?.dueAt, s.status, now)).length,
    languages: Array.from(byLocale.entries())
      .map(([locale, v]) => ({ locale, displayName: v.displayName, progress: computeProgress(v.segs), overdue: v.segs.filter((s) => isOverdue(s.assignments[0]?.dueAt, s.status, now)).length }))
      .sort((a, b) => a.locale.localeCompare(b.locale)),
    videos: videos.map((v) => ({ id: v.id, title: v.title, segmentCount: v.tracks.reduce((n, t) => n + t._count.segments, 0) })),
    recentActivity: audits.map((a) => ({ id: a.id, action: a.action, entityType: a.entityType, entityId: a.entityId, actorName: a.actorId ? (nameOf.get(a.actorId) ?? null) : null, createdAt: a.createdAt, metadata: a.metadata })),
    teamSize,
  };
}

export type SegmentListQuery = {
  page?: number;
  pageSize?: number;
  status?: SegmentStatus[];
  locale?: string;
  actorUserId?: string;
  videoId?: string;
  q?: string;
  overdue?: boolean;
  sort?: "dueAt" | "lastActivityAt" | "status" | "startMs";
  dir?: "asc" | "desc";
};

export async function listProjectSegments(userId: string, projectId: string, query: SegmentListQuery) {
  const access = await requireProjectAccess(userId, projectId);
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
  const where: Prisma.SegmentWhereInput = { languageTrack: { video: { projectId } } };
  if (access.level === "ACTOR") where.assignments = { some: { actorUserId: userId } };
  if (query.status?.length) where.status = { in: query.status };
  if (query.locale) where.languageTrack = { video: { projectId }, locale: query.locale };
  if (query.videoId) where.languageTrack = { ...(where.languageTrack as object), videoId: query.videoId };
  if (query.actorUserId) where.assignments = { some: { actorUserId: query.actorUserId, active: true } };
  if (query.q) where.OR = [{ script: { contains: query.q, mode: "insensitive" } }, { externalId: { contains: query.q, mode: "insensitive" } }];
  if (query.overdue) {
    where.status = { notIn: ["APPROVED"], ...(query.status?.length ? { in: query.status } : {}) };
    where.assignments = { some: { active: true, dueAt: { lt: new Date() }, ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}) } };
  }
  const orderBy: Prisma.SegmentOrderByWithRelationInput =
    query.sort === "status" ? { status: query.dir ?? "asc" } : query.sort === "startMs" ? { startMs: query.dir ?? "asc" } : query.sort === "dueAt" ? { lastActivityAt: query.dir ?? "desc" } : { lastActivityAt: query.dir ?? "desc" };

  const [total, items] = await Promise.all([
    prisma.segment.count({ where }),
    prisma.segment.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        languageTrack: { select: { locale: true, displayName: true, video: { select: { id: true, title: true } } } },
        assignments: { where: { active: true }, take: 1, include: { actor: { select: { id: true, name: true, email: true } } } },
        currentVersion: { select: { id: true, versionNumber: true, processingStatus: true, origin: true, createdAt: true } },
      },
    }),
  ]);
  const now = new Date();
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    access: access.level,
    items: items.map((s) => ({
      id: s.id,
      externalId: s.externalId,
      script: s.script,
      startMs: s.startMs,
      endMs: s.endMs,
      status: s.status,
      required: s.required,
      revision: s.revision,
      lastActivityAt: s.lastActivityAt,
      locale: s.languageTrack.locale,
      language: s.languageTrack.displayName,
      video: s.languageTrack.video,
      actor: s.assignments[0]?.actor ?? null,
      dueAt: s.assignments[0]?.dueAt ?? null,
      overdue: isOverdue(s.assignments[0]?.dueAt, s.status, now),
      currentVersion: s.currentVersion,
    })),
  };
}

export async function listProjectTeam(userId: string, projectId: string) {
  const access = await requireProjectAccess(userId, projectId, "REVIEW");
  const [members, orgMembers] = await Promise.all([
    prisma.projectMember.findMany({ where: { projectId }, include: { user: { select: { id: true, name: true, email: true, image: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.organizationMember.findMany({ where: { organizationId: access.organizationId }, include: { user: { select: { id: true, name: true, email: true, image: true } } }, orderBy: { createdAt: "asc" } }),
  ]);
  return { access, members, orgMembers };
}

export async function addProjectMember(actorUserId: string, projectId: string, memberUserId: string, role: "MANAGER" | "EDITOR" | "ACTOR") {
  const access = await requireProjectAccess(actorUserId, projectId, "FULL");
  const orgRole = await getOrgRole(prisma, memberUserId, access.organizationId);
  if (!orgRole) throw ApiError.validation("User must be a member of the organization first");
  return prisma.$transaction(async (tx) => {
    const m = await tx.projectMember.upsert({ where: { projectId_userId: { projectId, userId: memberUserId } }, update: { role }, create: { projectId, userId: memberUserId, role } });
    await recordAudit(tx, { organizationId: access.organizationId, actorId: actorUserId, action: "project.member_added", entityType: "ProjectMember", entityId: m.id, metadata: { projectId, memberUserId, role } });
    await createNotification(tx, { userId: memberUserId, type: "ASSIGNMENT_CREATED", title: "You were added to a project", resourceType: "Project", resourceId: projectId, href: `/projects/${projectId}` });
    return m;
  });
}

export async function removeProjectMember(actorUserId: string, projectId: string, memberUserId: string) {
  const access = await requireProjectAccess(actorUserId, projectId, "FULL");
  await prisma.$transaction(async (tx) => {
    await tx.projectMember.deleteMany({ where: { projectId, userId: memberUserId } });
    await recordAudit(tx, { organizationId: access.organizationId, actorId: actorUserId, action: "project.member_removed", entityType: "ProjectMember", entityId: memberUserId, metadata: { projectId, memberUserId } });
  });
}

/** Candidate actors for assignment: any org member (actors are usually project-scoped guests). */
export async function listAssignableUsers(userId: string, projectId: string) {
  const access = await requireProjectAccess(userId, projectId, "FULL");
  const members = await prisma.organizationMember.findMany({ where: { organizationId: access.organizationId }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { user: { name: "asc" } } });
  return members.map((m) => ({ id: m.user.id, name: m.user.name, email: m.user.email, orgRole: m.role }));
}

export async function addVideo(userId: string, projectId: string, input: { title: string; referenceUrl?: string; locales?: string[] }) {
  const access = await requireProjectAccess(userId, projectId, "FULL");
  return prisma.$transaction(async (tx) => {
    const count = await tx.video.count({ where: { projectId } });
    const video = await tx.video.create({ data: { projectId, title: input.title.trim(), referenceUrl: input.referenceUrl?.trim() || null, sortOrder: count } });
    for (const raw of input.locales ?? []) {
      const locale = normalizeLocale(raw);
      if (locale) await tx.languageTrack.create({ data: { videoId: video.id, locale, displayName: displayLanguageName(locale) } });
    }
    await recordAudit(tx, { organizationId: access.organizationId, actorId: userId, action: "video.created", entityType: "Video", entityId: video.id, metadata: { projectId, title: video.title } });
    return video;
  });
}

export async function deleteProject(userId: string, projectId: string) {
  const access = await requireProjectAccess(userId, projectId, "FULL");
  const keys = await prisma.recordingVersion.findMany({ where: { segment: { languageTrack: { video: { projectId } } } }, select: { objectKey: true } });
  await prisma.$transaction(async (tx) => {
    await recordAudit(tx, { organizationId: access.organizationId, actorId: userId, action: "project.deleted", entityType: "Project", entityId: projectId, metadata: { projectId, recordingCount: keys.length } });
    await tx.project.delete({ where: { id: projectId } });
  });
  return keys.map((k) => k.objectKey);
}

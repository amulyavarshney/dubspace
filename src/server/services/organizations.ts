import { createHash, randomBytes } from "node:crypto";
import type { OrgRole, ProjectRole } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/audit";
import { ApiError } from "@/server/errors";
import { can } from "@/server/authorization/policy";
import { createNotification } from "./notifications";

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "org";
}

export async function createOrganization(userId: string, name: string) {
  const trimmed = name.trim();
  if (trimmed.length < 2) throw ApiError.validation("Organization name must be at least 2 characters");
  let slug = slugify(trimmed);
  for (let i = 0; i < 5; i++) {
    const exists = await prisma.organization.findUnique({ where: { slug } });
    if (!exists) break;
    slug = `${slugify(trimmed)}-${randomBytes(2).toString("hex")}`;
  }
  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name: trimmed, slug } });
    await tx.organizationMember.create({ data: { organizationId: org.id, userId, role: "OWNER" } });
    await recordAudit(tx, { organizationId: org.id, actorId: userId, action: "organization.created", entityType: "Organization", entityId: org.id });
    return org;
  });
}

export async function listMembers(organizationId: string) {
  return prisma.organizationMember.findMany({
    where: { organizationId },
    include: { user: { select: { id: true, name: true, email: true, image: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function updateMemberRole(actorUserId: string, organizationId: string, memberUserId: string, role: OrgRole) {
  const actorRole = await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId, userId: actorUserId } } });
  if (!actorRole || !can.manageOrganization(actorRole.role)) throw ApiError.forbidden("Only owners can change roles");
  if (memberUserId === actorUserId && role !== "OWNER") {
    const owners = await prisma.organizationMember.count({ where: { organizationId, role: "OWNER" } });
    if (owners <= 1) throw ApiError.invalidState("An organization must keep at least one owner");
  }
  return prisma.$transaction(async (tx) => {
    const m = await tx.organizationMember.update({ where: { organizationId_userId: { organizationId, userId: memberUserId } }, data: { role } });
    await recordAudit(tx, { organizationId, actorId: actorUserId, action: "member.role_changed", entityType: "OrganizationMember", entityId: m.id, metadata: { role, memberUserId } });
    return m;
  });
}

export async function removeMember(actorUserId: string, organizationId: string, memberUserId: string) {
  const actorRole = await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId, userId: actorUserId } } });
  if (!actorRole || !can.manageOrganization(actorRole.role)) throw ApiError.forbidden("Only owners can remove members");
  const target = await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId, userId: memberUserId } } });
  if (!target) throw ApiError.notFound("Member not found");
  if (target.role === "OWNER") {
    const owners = await prisma.organizationMember.count({ where: { organizationId, role: "OWNER" } });
    if (owners <= 1) throw ApiError.invalidState("An organization must keep at least one owner");
  }
  await prisma.$transaction(async (tx) => {
    await tx.organizationMember.delete({ where: { id: target.id } });
    await tx.projectMember.deleteMany({ where: { userId: memberUserId, project: { organizationId } } });
    await tx.assignment.updateMany({
      where: { actorUserId: memberUserId, active: true, segment: { languageTrack: { video: { project: { organizationId } } } } },
      data: { active: false, deactivatedAt: new Date() },
    });
    await recordAudit(tx, { organizationId, actorId: actorUserId, action: "member.removed", entityType: "OrganizationMember", entityId: target.id, metadata: { memberUserId } });
  });
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createInvitation(input: {
  actorUserId: string;
  organizationId: string;
  email: string;
  role: OrgRole;
  projectId?: string;
  projectRole?: ProjectRole;
}) {
  const actor = await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: input.organizationId, userId: input.actorUserId } } });
  if (!actor) throw ApiError.notFound();
  const inviterCanInvite = can.manageOrganization(actor.role) || (can.createProject(actor.role) && input.role === "ACTOR") || (can.createProject(actor.role) && input.role === "EDITOR");
  if (!inviterCanInvite) throw ApiError.forbidden("You cannot invite members with this role");
  if (input.projectId) {
    const project = await prisma.project.findFirst({ where: { id: input.projectId, organizationId: input.organizationId } });
    if (!project) throw ApiError.notFound("Project not found");
  }
  const email = input.email.trim().toLowerCase();
  const token = randomBytes(32).toString("base64url");
  const invitation = await prisma.$transaction(async (tx) => {
    const inv = await tx.invitation.create({
      data: {
        organizationId: input.organizationId,
        email,
        role: input.role,
        projectId: input.projectId ?? null,
        projectRole: input.projectRole ?? null,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        invitedById: input.actorUserId,
      },
    });
    await recordAudit(tx, { organizationId: input.organizationId, actorId: input.actorUserId, action: "invitation.created", entityType: "Invitation", entityId: inv.id, metadata: { email, role: input.role, projectId: input.projectId } });
    // If the invitee already has an account, surface it in-app as well.
    const existing = await tx.user.findUnique({ where: { email } });
    if (existing) {
      await createNotification(tx, {
        userId: existing.id,
        type: "INVITATION",
        title: "You have been invited to an organization",
        body: `Accept the invitation to start collaborating.`,
        resourceType: "Invitation",
        resourceId: inv.id,
        href: `/invite/${token}`,
      });
    }
    return inv;
  });
  return { invitation, token, acceptUrl: `/invite/${token}` };
}

export async function getInvitationByToken(token: string) {
  const inv = await prisma.invitation.findUnique({ where: { tokenHash: hashToken(token) }, include: { organization: true, project: { select: { id: true, name: true } } } });
  if (!inv) return null;
  return inv;
}

export async function acceptInvitation(user: { id: string; email: string }, token: string) {
  const inv = await getInvitationByToken(token);
  if (!inv) throw ApiError.notFound("Invitation not found");
  if (inv.acceptedAt) throw ApiError.invalidState("This invitation has already been used");
  if (inv.expiresAt < new Date()) throw ApiError.invalidState("This invitation has expired");
  if (inv.email !== user.email.toLowerCase()) throw ApiError.forbidden("This invitation was issued to a different email address");

  await prisma.$transaction(async (tx) => {
    await tx.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: inv.organizationId, userId: user.id } },
      update: {},
      create: { organizationId: inv.organizationId, userId: user.id, role: inv.role },
    });
    if (inv.projectId) {
      await tx.projectMember.upsert({
        where: { projectId_userId: { projectId: inv.projectId, userId: user.id } },
        update: { role: inv.projectRole ?? "ACTOR" },
        create: { projectId: inv.projectId, userId: user.id, role: inv.projectRole ?? "ACTOR" },
      });
    }
    await tx.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
    await recordAudit(tx, { organizationId: inv.organizationId, actorId: user.id, action: "invitation.accepted", entityType: "Invitation", entityId: inv.id });
  });
  return inv;
}

export async function listPendingInvitations(organizationId: string) {
  return prisma.invitation.findMany({ where: { organizationId, acceptedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, include: { project: { select: { name: true } } } });
}

export async function revokeInvitation(actorUserId: string, organizationId: string, invitationId: string) {
  const actor = await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId, userId: actorUserId } } });
  if (!actor || !can.createProject(actor.role)) throw ApiError.forbidden();
  const inv = await prisma.invitation.findFirst({ where: { id: invitationId, organizationId } });
  if (!inv) throw ApiError.notFound();
  await prisma.invitation.delete({ where: { id: inv.id } });
}

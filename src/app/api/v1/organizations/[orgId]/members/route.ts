import { apiHandler, ok } from "@/server/api/handler";
import { requireOrgRole } from "@/server/authorization/access";
import { listMembers, listPendingInvitations } from "@/server/services/organizations";

export const GET = apiHandler<{ orgId: string }>(async ({ user, params }) => {
  await requireOrgRole(user.id, params.orgId);
  const [members, invitations] = await Promise.all([listMembers(params.orgId), listPendingInvitations(params.orgId)]);
  return ok({
    members: members.map((m) => ({ id: m.id, role: m.role, createdAt: m.createdAt, user: m.user })),
    invitations: invitations.map((i) => ({ id: i.id, email: i.email, role: i.role, project: i.project?.name ?? null, expiresAt: i.expiresAt, createdAt: i.createdAt })),
  });
});

import type { Metadata } from "next";
import { requireOrgContext, requireSessionUser } from "@/server/auth/session";
import { listMembers, listPendingInvitations } from "@/server/services/organizations";
import { MembersManager } from "./members-manager";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage() {
  const user = await requireSessionUser();
  const ctx = await requireOrgContext(user.id);
  const [members, invitations] = await Promise.all([listMembers(ctx.organization.id), listPendingInvitations(ctx.organization.id)]);
  return (
    <MembersManager
      organizationId={ctx.organization.id}
      currentUserId={user.id}
      currentRole={ctx.role}
      members={members.map((m) => ({ id: m.id, role: m.role, createdAt: m.createdAt.toISOString(), user: m.user }))}
      invitations={invitations.map((i) => ({ id: i.id, email: i.email, role: i.role, project: i.project?.name ?? null, expiresAt: i.expiresAt.toISOString() }))}
    />
  );
}

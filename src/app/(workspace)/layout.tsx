import { AppShell } from "@/components/layout/app-shell";
import { requireOrgContext, requireSessionUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSessionUser();
  const ctx = await requireOrgContext(user.id);
  const unread = await prisma.notification.count({ where: { userId: user.id, readAt: null } });
  return (
    <AppShell
      user={{ id: user.id, name: user.name, email: user.email }}
      org={{ id: ctx.organization.id, name: ctx.organization.name, role: ctx.role, memberships: ctx.memberships }}
      unread={unread}
    >
      {children}
    </AppShell>
  );
}

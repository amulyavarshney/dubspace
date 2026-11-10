import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { prisma } from "@/server/db/prisma";
import type { OrgRole } from "@/generated/prisma/enums";

export const ORG_COOKIE = "dw_org";

export type SessionUser = { id: string; email: string; name: string; image?: string | null };

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const u = session.user;
  return { id: u.id, email: u.email, name: u.name, image: u.image };
}

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export type OrgContext = {
  organization: { id: string; name: string; slug: string };
  role: OrgRole;
  memberships: Array<{ organizationId: string; name: string; slug: string; role: OrgRole }>;
};

/**
 * Resolves the active organization for a user. The active org is a cookie preference
 * that is only honoured when the user is actually a member of that organization.
 */
export async function getOrgContext(userId: string, preferredOrgId?: string | null): Promise<OrgContext | null> {
  const memberships = await prisma.organizationMember.findMany({
    where: { userId },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) return null;
  const preferred = preferredOrgId ?? (await cookies()).get(ORG_COOKIE)?.value ?? null;
  const active = memberships.find((m) => m.organizationId === preferred) ?? memberships[0];
  return {
    organization: { id: active.organization.id, name: active.organization.name, slug: active.organization.slug },
    role: active.role,
    memberships: memberships.map((m) => ({
      organizationId: m.organizationId,
      name: m.organization.name,
      slug: m.organization.slug,
      role: m.role,
    })),
  };
}

export async function requireOrgContext(userId: string): Promise<OrgContext> {
  const ctx = await getOrgContext(userId);
  if (!ctx) redirect("/onboarding");
  return ctx;
}

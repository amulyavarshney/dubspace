import type { NextRequest } from "next/server";
import { prisma } from "@/server/db/prisma";
import { ORG_COOKIE } from "@/server/auth/session";
import { ApiError } from "@/server/errors";
import type { OrgRole } from "@/generated/prisma/enums";

/** Resolves the active organization for API calls from the org cookie (membership enforced). */
export async function resolveOrgForApi(req: NextRequest, userId: string): Promise<{ organizationId: string; role: OrgRole }> {
  const preferred = req.cookies.get(ORG_COOKIE)?.value ?? null;
  const memberships = await prisma.organizationMember.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { organizationId: true, role: true } });
  if (!memberships.length) throw ApiError.forbidden("You are not a member of any organization");
  const active = memberships.find((m) => m.organizationId === preferred) ?? memberships[0];
  return { organizationId: active.organizationId, role: active.role };
}

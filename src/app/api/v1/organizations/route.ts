import { z } from "zod";
import { apiHandler, ok, parseJson } from "@/server/api/handler";
import { prisma } from "@/server/db/prisma";
import { createOrganization } from "@/server/services/organizations";

export const GET = apiHandler(async ({ user }) => {
  const memberships = await prisma.organizationMember.findMany({ where: { userId: user.id }, include: { organization: true }, orderBy: { createdAt: "asc" } });
  return ok({ items: memberships.map((m) => ({ id: m.organization.id, name: m.organization.name, slug: m.organization.slug, role: m.role })) });
});

export const POST = apiHandler(
  async ({ req, user }) => {
    const body = await parseJson(req, z.object({ name: z.string().min(2).max(80) }));
    const org = await createOrganization(user.id, body.name);
    return ok({ id: org.id, name: org.name, slug: org.slug }, { status: 201 });
  },
  { rateLimit: { limit: 5, windowMs: 60_000 } },
);

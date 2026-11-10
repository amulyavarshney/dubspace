import { z } from "zod";
import { apiHandler, ok, parseJson } from "@/server/api/handler";
import { prisma } from "@/server/db/prisma";
import { ORG_COOKIE } from "@/server/auth/session";
import { ApiError } from "@/server/errors";

export const POST = apiHandler(async ({ req, user }) => {
  const { organizationId } = await parseJson(req, z.object({ organizationId: z.string().uuid() }));
  const m = await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId, userId: user.id } } });
  if (!m) throw ApiError.notFound();
  const res = ok({ organizationId });
  res.headers.append("Set-Cookie", `${ORG_COOKIE}=${organizationId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  return res;
});

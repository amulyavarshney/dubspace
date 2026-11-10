import { z } from "zod";
import { apiHandler, ok, parseJson } from "@/server/api/handler";
import { ORG_COOKIE } from "@/server/auth/session";
import { acceptInvitation } from "@/server/services/organizations";

export const POST = apiHandler(
  async ({ req, user }) => {
    const { token } = await parseJson(req, z.object({ token: z.string().min(16).max(128) }));
    const inv = await acceptInvitation({ id: user.id, email: user.email }, token);
    const res = ok({ organizationId: inv.organizationId, projectId: inv.projectId });
    res.headers.append("Set-Cookie", `${ORG_COOKIE}=${inv.organizationId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`);
    return res;
  },
  { rateLimit: { limit: 10, windowMs: 60_000 } },
);

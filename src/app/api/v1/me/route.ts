import { apiHandler, ok } from "@/server/api/handler";
import { resolveOrgForApi } from "@/server/api/org";

export const GET = apiHandler(async ({ req, user }) => {
  const org = await resolveOrgForApi(req, user.id).catch(() => null);
  return ok({ user, organization: org });
});

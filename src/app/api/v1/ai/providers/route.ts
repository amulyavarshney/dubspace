import { apiHandler, ok } from "@/server/api/handler";
import { resolveOrgForApi } from "@/server/api/org";
import { availableProvidersForOrg } from "@/server/services/ai-providers";

export const GET = apiHandler(async ({ req, user }) => {
  const org = await resolveOrgForApi(req, user.id);
  return ok({ items: await availableProvidersForOrg(org.organizationId) });
});

import { apiHandler, ok } from "@/server/api/handler";
import { resolveOrgForApi } from "@/server/api/org";
import { listProviderConfigs } from "@/server/services/ai-providers";

export const GET = apiHandler(async ({ req, user }) => {
  const org = await resolveOrgForApi(req, user.id);
  const res = ok({ organizationId: org.organizationId, role: org.role, providers: await listProviderConfigs(user.id, org.organizationId) });
  res.headers.set("Cache-Control", "private, no-store");
  return res;
});

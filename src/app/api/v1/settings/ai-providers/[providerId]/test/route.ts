import { apiHandler, ok } from "@/server/api/handler";
import { resolveOrgForApi } from "@/server/api/org";
import { testProviderCredential } from "@/server/services/ai-providers";

export const POST = apiHandler<{ providerId: string }>(
  async ({ req, user, params }) => {
    const org = await resolveOrgForApi(req, user.id);
    return ok(await testProviderCredential(user.id, org.organizationId, params.providerId));
  },
  { rateLimit: { limit: 6, windowMs: 60_000 } },
);

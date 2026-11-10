import { apiHandler, ok } from "@/server/api/handler";
import { resolveOrgForApi } from "@/server/api/org";
import { listProviderVoices } from "@/server/services/ai-providers";

export const GET = apiHandler<{ providerId: string }>(
  async ({ req, user, params }) => {
    const org = await resolveOrgForApi(req, user.id);
    return ok({ items: await listProviderVoices(user.id, org.organizationId, params.providerId) });
  },
  { rateLimit: { limit: 30, windowMs: 60_000 } },
);

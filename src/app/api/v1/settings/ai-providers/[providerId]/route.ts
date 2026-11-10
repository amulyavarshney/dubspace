import { z } from "zod";
import { apiHandler, ok, parseJson } from "@/server/api/handler";
import { resolveOrgForApi } from "@/server/api/org";
import { deleteProviderCredential, saveProviderCredential } from "@/server/services/ai-providers";

export const PUT = apiHandler<{ providerId: string }>(
  async ({ req, user, params }) => {
    const org = await resolveOrgForApi(req, user.id);
    const body = await parseJson(
      req,
      z.object({
        apiKey: z.string().min(8).max(512).optional(),
        enabled: z.boolean().optional(),
        isDefault: z.boolean().optional(),
        monthlyCharacterQuota: z.number().int().positive().max(1_000_000_000).nullable().optional(),
      }),
    );
    const view = await saveProviderCredential({ userId: user.id, organizationId: org.organizationId, providerId: params.providerId, secret: body.apiKey, enabled: body.enabled, isDefault: body.isDefault, monthlyCharacterQuota: body.monthlyCharacterQuota });
    const res = ok(view);
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  },
  { rateLimit: { limit: 10, windowMs: 60_000 } },
);

export const DELETE = apiHandler<{ providerId: string }>(async ({ req, user, params }) => {
  const org = await resolveOrgForApi(req, user.id);
  await deleteProviderCredential(user.id, org.organizationId, params.providerId);
  return ok({ deleted: true });
});

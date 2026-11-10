import { z } from "zod";
import { apiHandler, ok, parseJson } from "@/server/api/handler";
import { createGenerationJob, listGenerationJobs } from "@/server/services/ai-generation";

export const GET = apiHandler<{ segmentId: string }>(async ({ user, params }) => {
  return ok({ items: await listGenerationJobs(user.id, params.segmentId) });
});

export const POST = apiHandler<{ segmentId: string }>(
  async ({ req, user, params }) => {
    const body = await parseJson(
      req,
      z.object({
        providerId: z.string().max(40).optional(),
        voiceId: z.string().min(1).max(120),
        modelId: z.string().min(1).max(120),
        text: z.string().max(5000).optional(),
        options: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])).optional(),
      }),
    );
    const job = await createGenerationJob({ userId: user.id, segmentId: params.segmentId, ...body });
    return ok({ id: job.id, status: job.status }, { status: 202 });
  },
  { rateLimit: { limit: 20, windowMs: 60_000 } },
);

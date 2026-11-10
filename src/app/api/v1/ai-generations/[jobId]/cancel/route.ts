import { apiHandler, ok } from "@/server/api/handler";
import { cancelGenerationJob } from "@/server/services/ai-generation";

export const POST = apiHandler<{ jobId: string }>(async ({ user, params }) => {
  const job = await cancelGenerationJob(user.id, params.jobId);
  return ok({ id: job.id, status: job.status, cancelRequestedAt: job.cancelRequestedAt });
});

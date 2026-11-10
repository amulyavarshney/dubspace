import { apiHandler, ok } from "@/server/api/handler";
import { retryGenerationJob } from "@/server/services/ai-generation";

export const POST = apiHandler<{ jobId: string }>(async ({ user, params }) => {
  const job = await retryGenerationJob(user.id, params.jobId);
  return ok({ id: job.id, status: job.status }, { status: 202 });
});

import { apiHandler, ok } from "@/server/api/handler";
import { getGenerationJob } from "@/server/services/ai-generation";

export const GET = apiHandler<{ jobId: string }>(async ({ user, params }) => {
  return ok(await getGenerationJob(user.id, params.jobId));
});

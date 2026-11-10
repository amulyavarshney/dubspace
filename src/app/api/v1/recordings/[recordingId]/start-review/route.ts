import { apiHandler, ok } from "@/server/api/handler";
import { startReview } from "@/server/services/reviews";

export const POST = apiHandler<{ recordingId: string }>(async ({ user, params }) => {
  return ok({ segment: await startReview(user.id, params.recordingId) });
});

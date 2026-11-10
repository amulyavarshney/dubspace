import { apiHandler, ok } from "@/server/api/handler";
import { completeUpload } from "@/server/services/recordings";

export const POST = apiHandler<{ recordingId: string }>(async ({ user, params }) => {
  const rv = await completeUpload(user.id, params.recordingId);
  return ok({ id: rv.id, processingStatus: rv.processingStatus });
});

import { apiHandler, ok } from "@/server/api/handler";
import { getRecordingStatus } from "@/server/services/recordings";

export const GET = apiHandler<{ recordingId: string }>(async ({ user, params }) => {
  return ok(await getRecordingStatus(user.id, params.recordingId));
});

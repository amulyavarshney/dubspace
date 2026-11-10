import { apiHandler, ok } from "@/server/api/handler";
import { getPlaybackUrl } from "@/server/services/recordings";

export const GET = apiHandler<{ recordingId: string }>(async ({ user, params }) => {
  const res = ok(await getPlaybackUrl(user.id, params.recordingId));
  res.headers.set("Cache-Control", "private, no-store");
  return res;
});

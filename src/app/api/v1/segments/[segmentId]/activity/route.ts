import { apiHandler, ok } from "@/server/api/handler";
import { getSegmentActivity } from "@/server/services/segments";

export const GET = apiHandler<{ segmentId: string }>(async ({ user, params }) => {
  return ok({ items: await getSegmentActivity(user.id, params.segmentId) });
});

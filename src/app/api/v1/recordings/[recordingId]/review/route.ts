import { z } from "zod";
import { apiHandler, ok, parseJson } from "@/server/api/handler";
import { submitReview } from "@/server/services/reviews";

export const POST = apiHandler<{ recordingId: string }>(async ({ req, user, params }) => {
  const body = await parseJson(
    req,
    z.object({ decision: z.enum(["APPROVED", "CHANGES_REQUESTED", "REOPENED"]), reason: z.string().max(4000).optional(), expectedSegmentRevision: z.number().int().min(0) }),
  );
  return ok(await submitReview({ userId: user.id, recordingVersionId: params.recordingId, ...body }));
});

import { z } from "zod";
import { apiHandler, ok, parseJson } from "@/server/api/handler";
import { getSegmentDetail, updateSegment } from "@/server/services/segments";

export const GET = apiHandler<{ segmentId: string }>(async ({ user, params }) => {
  const detail = await getSegmentDetail(user.id, params.segmentId);
  return ok({ segment: detail.segment, permissions: detail.permissions });
});

export const PATCH = apiHandler<{ segmentId: string }>(async ({ req, user, params }) => {
  const body = await parseJson(
    req,
    z.object({
      script: z.string().min(1).max(10000).optional(),
      notes: z.string().max(4000).nullable().optional(),
      required: z.boolean().optional(),
      startMs: z.number().int().min(0).optional(),
      endMs: z.number().int().min(1).optional(),
      externalId: z.string().max(120).nullable().optional(),
    }),
  );
  const seg = await updateSegment(user.id, params.segmentId, body);
  return ok({ id: seg.id, revision: seg.revision });
});

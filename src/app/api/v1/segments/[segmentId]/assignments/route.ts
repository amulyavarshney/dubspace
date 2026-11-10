import { z } from "zod";
import { apiHandler, ok, parseJson } from "@/server/api/handler";
import { assignActor } from "@/server/services/segments";

export const POST = apiHandler<{ segmentId: string }>(async ({ req, user, params }) => {
  const body = await parseJson(req, z.object({ actorUserId: z.string().min(1).max(64).nullable(), dueAt: z.string().datetime().nullable().optional() }));
  const result = await assignActor({ userId: user.id, segmentId: params.segmentId, actorUserId: body.actorUserId, dueAt: body.dueAt ? new Date(body.dueAt) : null });
  return ok({ assignment: result.assignment, status: result.segment.status, revision: result.segment.revision }, { status: 201 });
});

import { z } from "zod";
import { apiHandler, ok, parseJson } from "@/server/api/handler";
import { updateComment } from "@/server/services/comments";

export const PATCH = apiHandler<{ commentId: string }>(async ({ req, user, params }) => {
  const body = await parseJson(req, z.object({ body: z.string().min(1).max(4000).optional(), resolved: z.boolean().optional() }));
  return ok(await updateComment({ userId: user.id, commentId: params.commentId, ...body }));
});

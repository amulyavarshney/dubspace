import { z } from "zod";
import { apiHandler, ok, parseJson } from "@/server/api/handler";
import { addComment } from "@/server/services/comments";

export const POST = apiHandler<{ recordingId: string }>(
  async ({ req, user, params }) => {
    const body = await parseJson(req, z.object({ timestampMs: z.number().int().min(0), body: z.string().min(1).max(4000), parentId: z.string().uuid().optional() }));
    const comment = await addComment({ userId: user.id, recordingVersionId: params.recordingId, ...body });
    return ok(comment, { status: 201 });
  },
  { rateLimit: { limit: 60, windowMs: 60_000 } },
);

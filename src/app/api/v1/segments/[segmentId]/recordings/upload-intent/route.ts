import { z } from "zod";
import { apiHandler, ok, parseJson } from "@/server/api/handler";
import { createUploadIntent } from "@/server/services/recordings";

export const POST = apiHandler<{ segmentId: string }>(
  async ({ req, user, params }) => {
    const body = await parseJson(
      req,
      z.object({ filename: z.string().min(1).max(255), mimeType: z.string().min(3).max(100), sizeBytes: z.number().int().positive(), idempotencyKey: z.string().min(8).max(128).optional() }),
    );
    return ok(await createUploadIntent({ userId: user.id, segmentId: params.segmentId, ...body }), { status: 201 });
  },
  { rateLimit: { limit: 60, windowMs: 60_000 } },
);

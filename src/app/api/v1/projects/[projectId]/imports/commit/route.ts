import { z } from "zod";
import { apiHandler, ok, parseJson } from "@/server/api/handler";
import { commitImport } from "@/server/services/imports";

export const POST = apiHandler<{ projectId: string }>(async ({ req, user, params }) => {
  const body = await parseJson(req, z.object({ batchId: z.string().uuid(), mode: z.enum(["all", "valid_only"]).default("all") }));
  return ok(await commitImport({ userId: user.id, projectId: params.projectId, batchId: body.batchId, mode: body.mode }));
});

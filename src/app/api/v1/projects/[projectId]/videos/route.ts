import { z } from "zod";
import { apiHandler, ok, parseJson } from "@/server/api/handler";
import { addVideo } from "@/server/services/projects";

export const POST = apiHandler<{ projectId: string }>(async ({ req, user, params }) => {
  const body = await parseJson(req, z.object({ title: z.string().min(1).max(200), referenceUrl: z.string().url().optional().or(z.literal("")), locales: z.array(z.string().max(40)).max(50).optional() }));
  const v = await addVideo(user.id, params.projectId, { ...body, referenceUrl: body.referenceUrl || undefined });
  return ok({ id: v.id, title: v.title }, { status: 201 });
});

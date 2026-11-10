import { z } from "zod";
import { apiHandler, ok, parseJson } from "@/server/api/handler";
import { markNotificationRead } from "@/server/services/notifications";

export const PATCH = apiHandler<{ id: string }>(async ({ req, user, params }) => {
  const body = await parseJson(req, z.object({ read: z.boolean().default(true) }).default({ read: true }));
  const n = await markNotificationRead(user.id, params.id, body.read);
  return ok({ id: n.id, readAt: n.readAt });
});

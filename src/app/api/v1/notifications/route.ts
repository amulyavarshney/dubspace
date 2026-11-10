import { z } from "zod";
import { apiHandler, ok, parseQuery } from "@/server/api/handler";
import { listNotifications } from "@/server/services/notifications";

export const GET = apiHandler(async ({ req, user }) => {
  const q = parseQuery(req, z.object({ unread: z.enum(["true", "false"]).optional(), limit: z.coerce.number().int().min(1).max(100).optional() }));
  return ok(await listNotifications(user.id, { unreadOnly: q.unread === "true", limit: q.limit }));
});

import { apiHandler, ok } from "@/server/api/handler";
import { markAllRead } from "@/server/services/notifications";

export const POST = apiHandler(async ({ user }) => {
  await markAllRead(user.id);
  return ok({ ok: true });
});

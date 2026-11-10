import { apiHandler, ok } from "@/server/api/handler";
import { listMyAssignments } from "@/server/services/assignments";

export const GET = apiHandler(async ({ user }) => {
  return ok({ items: await listMyAssignments(user.id) });
});

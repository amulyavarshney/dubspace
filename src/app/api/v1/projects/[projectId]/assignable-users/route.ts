import { apiHandler, ok } from "@/server/api/handler";
import { listAssignableUsers } from "@/server/services/projects";

export const GET = apiHandler<{ projectId: string }>(async ({ user, params }) => {
  return ok({ items: await listAssignableUsers(user.id, params.projectId) });
});

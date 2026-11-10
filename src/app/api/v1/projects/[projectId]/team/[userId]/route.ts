import { apiHandler, ok } from "@/server/api/handler";
import { removeProjectMember } from "@/server/services/projects";

export const DELETE = apiHandler<{ projectId: string; userId: string }>(async ({ user, params }) => {
  await removeProjectMember(user.id, params.projectId, params.userId);
  return ok({ removed: true });
});

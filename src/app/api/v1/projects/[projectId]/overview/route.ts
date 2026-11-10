import { apiHandler, ok } from "@/server/api/handler";
import { getProjectOverview } from "@/server/services/projects";

export const GET = apiHandler<{ projectId: string }>(async ({ user, params }) => {
  return ok(await getProjectOverview(user.id, params.projectId));
});

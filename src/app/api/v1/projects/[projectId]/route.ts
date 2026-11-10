import { apiHandler, ok } from "@/server/api/handler";
import { deleteProject, getProject } from "@/server/services/projects";
import { getStorage } from "@/server/storage";

export const GET = apiHandler<{ projectId: string }>(async ({ user, params }) => {
  const { project, access } = await getProject(user.id, params.projectId);
  return ok({ project, access: access.level });
});

export const DELETE = apiHandler<{ projectId: string }>(async ({ user, params }) => {
  const keys = await deleteProject(user.id, params.projectId);
  // Best-effort storage cleanup after the audited delete commits.
  const storage = getStorage();
  await Promise.allSettled(keys.map((k) => storage.deleteObject(k)));
  return ok({ deleted: true, objectsRemoved: keys.length });
});

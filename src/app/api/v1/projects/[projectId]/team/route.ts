import { z } from "zod";
import { apiHandler, ok, parseJson } from "@/server/api/handler";
import { addProjectMember, listProjectTeam } from "@/server/services/projects";

export const GET = apiHandler<{ projectId: string }>(async ({ user, params }) => {
  const { access, members, orgMembers } = await listProjectTeam(user.id, params.projectId);
  return ok({ access: access.level, members, orgMembers });
});

export const POST = apiHandler<{ projectId: string }>(async ({ req, user, params }) => {
  const body = await parseJson(req, z.object({ userId: z.string().min(1).max(64), role: z.enum(["MANAGER", "EDITOR", "ACTOR"]) }));
  const m = await addProjectMember(user.id, params.projectId, body.userId, body.role);
  return ok({ id: m.id, role: m.role }, { status: 201 });
});

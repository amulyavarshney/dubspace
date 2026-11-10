import { z } from "zod";
import { apiHandler, ok, parseJson } from "@/server/api/handler";
import { removeMember, updateMemberRole } from "@/server/services/organizations";

export const PATCH = apiHandler<{ orgId: string; userId: string }>(async ({ req, user, params }) => {
  const { role } = await parseJson(req, z.object({ role: z.enum(["OWNER", "MANAGER", "EDITOR", "ACTOR"]) }));
  const m = await updateMemberRole(user.id, params.orgId, params.userId, role);
  return ok({ id: m.id, role: m.role });
});

export const DELETE = apiHandler<{ orgId: string; userId: string }>(async ({ user, params }) => {
  await removeMember(user.id, params.orgId, params.userId);
  return ok({ removed: true });
});

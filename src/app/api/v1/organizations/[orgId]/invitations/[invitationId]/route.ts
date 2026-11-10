import { apiHandler, ok } from "@/server/api/handler";
import { revokeInvitation } from "@/server/services/organizations";

export const DELETE = apiHandler<{ orgId: string; invitationId: string }>(async ({ user, params }) => {
  await revokeInvitation(user.id, params.orgId, params.invitationId);
  return ok({ revoked: true });
});

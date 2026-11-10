import { z } from "zod";
import { apiHandler, ok, parseJson } from "@/server/api/handler";
import { createInvitation } from "@/server/services/organizations";

export const POST = apiHandler<{ orgId: string }>(
  async ({ req, user, params }) => {
    const body = await parseJson(
      req,
      z.object({
        email: z.string().email(),
        role: z.enum(["OWNER", "MANAGER", "EDITOR", "ACTOR"]),
        projectId: z.string().uuid().optional(),
        projectRole: z.enum(["MANAGER", "EDITOR", "ACTOR"]).optional(),
      }),
    );
    const { invitation, acceptUrl } = await createInvitation({ actorUserId: user.id, organizationId: params.orgId, ...body });
    // The invite link is returned to the inviter so it can be shared; email delivery goes through the outbox.
    return ok({ id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt, acceptUrl }, { status: 201 });
  },
  { rateLimit: { limit: 20, windowMs: 60_000 } },
);

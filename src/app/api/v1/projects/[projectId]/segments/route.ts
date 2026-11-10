import { z } from "zod";
import { apiHandler, ok, parseJson, parseQuery } from "@/server/api/handler";
import { listProjectSegments } from "@/server/services/projects";
import { createSegment } from "@/server/services/segments";

const statusEnum = z.enum(["UNASSIGNED", "ASSIGNED", "SUBMITTED", "IN_REVIEW", "CHANGES_REQUESTED", "APPROVED", "REOPENED"]);

export const GET = apiHandler<{ projectId: string }>(async ({ req, user, params }) => {
  const q = parseQuery(
    req,
    z.object({
      page: z.coerce.number().int().min(1).optional(),
      pageSize: z.coerce.number().int().min(1).max(100).optional(),
      status: z.string().optional(),
      locale: z.string().optional(),
      actorUserId: z.string().min(1).max(64).optional(),
      videoId: z.string().uuid().optional(),
      q: z.string().max(200).optional(),
      overdue: z.enum(["true", "false"]).optional(),
      sort: z.enum(["dueAt", "lastActivityAt", "status", "startMs"]).optional(),
      dir: z.enum(["asc", "desc"]).optional(),
    }),
  );
  const statuses = q.status ? q.status.split(",").map((s) => statusEnum.parse(s.trim())) : undefined;
  return ok(await listProjectSegments(user.id, params.projectId, { ...q, status: statuses, overdue: q.overdue === "true" }));
});

export const POST = apiHandler<{ projectId: string }>(async ({ req, user, params }) => {
  const body = await parseJson(
    req,
    z.object({
      videoId: z.string().uuid(),
      locale: z.string().min(2).max(20),
      startMs: z.number().int().min(0),
      endMs: z.number().int().min(1),
      script: z.string().min(1).max(10000),
      externalId: z.string().max(120).optional(),
      notes: z.string().max(4000).optional(),
      required: z.boolean().optional(),
    }),
  );
  const seg = await createSegment(user.id, params.projectId, body);
  return ok({ id: seg.id }, { status: 201 });
});

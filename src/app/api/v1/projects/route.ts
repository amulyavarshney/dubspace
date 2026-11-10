import { z } from "zod";
import { apiHandler, ok, parseJson } from "@/server/api/handler";
import { resolveOrgForApi } from "@/server/api/org";
import { createProject, listProjectsForUser } from "@/server/services/projects";

export const GET = apiHandler(async ({ req, user }) => {
  const org = await resolveOrgForApi(req, user.id);
  return ok({ items: await listProjectsForUser(user.id, org.organizationId) });
});

export const createProjectSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(2000).optional(),
  deadline: z.string().datetime().nullable().optional(),
  sourceLocale: z.string().max(20).optional(),
  videos: z.array(z.object({ title: z.string().min(1).max(200), referenceUrl: z.string().url().optional().or(z.literal("")) })).max(200).optional(),
  targetLocales: z.array(z.string().max(40)).max(50).optional(),
});

export const POST = apiHandler(
  async ({ req, user }) => {
    const org = await resolveOrgForApi(req, user.id);
    const body = await parseJson(req, createProjectSchema);
    const project = await createProject(user.id, org.organizationId, {
      ...body,
      deadline: body.deadline ? new Date(body.deadline) : null,
      videos: body.videos?.map((v) => ({ title: v.title, referenceUrl: v.referenceUrl || undefined })),
    });
    return ok({ id: project.id, name: project.name }, { status: 201 });
  },
  { rateLimit: { limit: 20, windowMs: 60_000 } },
);

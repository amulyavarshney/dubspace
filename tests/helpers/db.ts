import { prisma } from "@/server/db/prisma";
import { auth } from "@/server/auth/auth";

export async function resetDatabase() {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "user", "Organization", "BackgroundJob", "OutboxEvent" RESTART IDENTITY CASCADE`);
}

let counter = 0;
export async function createUser(prefix = "user") {
  counter++;
  const email = `${prefix}-${Date.now()}-${counter}@test.local`;
  const res = await auth.api.signUpEmail({ body: { email, name: `${prefix} ${counter}`, password: "password123" } });
  return { id: res.user.id, email, name: res.user.name };
}

export async function createOrgWithOwner() {
  const owner = await createUser("owner");
  const org = await prisma.organization.create({ data: { name: `Org ${counter}`, slug: `org-${Date.now()}-${counter}` } });
  await prisma.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER" } });
  return { org, owner };
}

export async function addMember(orgId: string, role: "OWNER" | "MANAGER" | "EDITOR" | "ACTOR", prefix = role.toLowerCase()) {
  const user = await createUser(prefix);
  await prisma.organizationMember.create({ data: { organizationId: orgId, userId: user.id, role } });
  return user;
}

export async function createProjectWithSegment(orgId: string, createdById: string, opts: { locale?: string } = {}) {
  const project = await prisma.project.create({ data: { organizationId: orgId, name: "Test project", createdById } });
  const video = await prisma.video.create({ data: { projectId: project.id, title: "Ep 1" } });
  const track = await prisma.languageTrack.create({ data: { videoId: video.id, locale: opts.locale ?? "es", displayName: "Spanish" } });
  const segment = await prisma.segment.create({ data: { languageTrackId: track.id, externalId: "S1", startMs: 0, endMs: 3000, script: "Hola mundo" } });
  return { project, video, track, segment };
}

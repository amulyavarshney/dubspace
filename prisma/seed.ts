import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { auth } from "../src/server/auth/auth";
import { synthWav } from "../src/server/providers/mock/adapter";
import { getStorage } from "../src/server/storage";
import { encryptSecret, safeLast4 } from "../src/server/crypto/secrets";

/**
 * Demo data for local development and e2e tests. All accounts use the password
 * `password123` (development only).
 *
 *  owner@dubspace.test    organization owner
 *  manager@dubspace.test  project manager
 *  editor@dubspace.test   editor / reviewer
 *  maria.actor@dubspace.test, jonas.actor@dubspace.test   voice actors
 *  outsider@dubspace.test  owner of a second, unrelated organization (tenant isolation checks)
 */
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
export const SEED_PASSWORD = "password123";

async function ensureUser(email: string, name: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const res = await auth.api.signUpEmail({ body: { email, name, password: SEED_PASSWORD } });
  return prisma.user.findUniqueOrThrow({ where: { id: res.user.id } });
}

async function main() {
  const [owner, manager, editor, maria, jonas, outsider] = await Promise.all([
    ensureUser("owner@dubspace.test", "Olivia Owner"),
    ensureUser("manager@dubspace.test", "Marcus Manager"),
    ensureUser("editor@dubspace.test", "Elena Editor"),
    ensureUser("maria.actor@dubspace.test", "María Delgado"),
    ensureUser("jonas.actor@dubspace.test", "Jonas Weber"),
    ensureUser("outsider@dubspace.test", "Oscar Outsider"),
  ]);

  const org = await prisma.organization.upsert({ where: { slug: "northwind-studios" }, update: {}, create: { name: "Northwind Studios", slug: "northwind-studios" } });
  const other = await prisma.organization.upsert({ where: { slug: "other-studio" }, update: {}, create: { name: "Other Studio", slug: "other-studio" } });
  const members: Array<[string, "OWNER" | "MANAGER" | "EDITOR" | "ACTOR"]> = [
    [owner.id, "OWNER"],
    [manager.id, "MANAGER"],
    [editor.id, "EDITOR"],
    [maria.id, "ACTOR"],
    [jonas.id, "ACTOR"],
  ];
  for (const [userId, role] of members) {
    await prisma.organizationMember.upsert({ where: { organizationId_userId: { organizationId: org.id, userId } }, update: { role }, create: { organizationId: org.id, userId, role } });
  }
  await prisma.organizationMember.upsert({ where: { organizationId_userId: { organizationId: other.id, userId: outsider.id } }, update: {}, create: { organizationId: other.id, userId: outsider.id, role: "OWNER" } });

  const existingProject = await prisma.project.findFirst({ where: { organizationId: org.id, name: "City Stories — Season 1" } });
  if (existingProject) {
    console.log("Seed already applied; skipping project creation.");
    return;
  }

  const project = await prisma.project.create({
    data: {
      organizationId: org.id,
      name: "City Stories — Season 1",
      description: "Documentary localization into Spanish and German. Deliver mixed stems by the deadline.",
      deadline: new Date(Date.now() + 21 * 24 * 3600 * 1000),
      sourceLocale: "en",
      createdById: manager.id,
    },
  });
  await prisma.project.create({ data: { organizationId: other.id, name: "Unrelated Project", createdById: outsider.id } });

  const ep1 = await prisma.video.create({ data: { projectId: project.id, title: "Episode 1 — Arrival", referenceUrl: "https://example.com/reference/ep1", sortOrder: 0 } });
  const ep2 = await prisma.video.create({ data: { projectId: project.id, title: "Episode 2 — The Market", sortOrder: 1 } });
  const tracks = {
    ep1es: await prisma.languageTrack.create({ data: { videoId: ep1.id, locale: "es", displayName: "Spanish" } }),
    ep1de: await prisma.languageTrack.create({ data: { videoId: ep1.id, locale: "de", displayName: "German" } }),
    ep2es: await prisma.languageTrack.create({ data: { videoId: ep2.id, locale: "es", displayName: "Spanish" } }),
    ep2de: await prisma.languageTrack.create({ data: { videoId: ep2.id, locale: "de", displayName: "German" } }),
  };

  const lines = {
    es: ["Bienvenidos de nuevo. Hoy exploramos el corazón de la ciudad.", "Cada esquina cuenta una historia diferente.", "Los mercados abren antes del amanecer.", "Aquí, el tiempo parece detenerse."],
    de: ["Willkommen zurück. Heute erkunden wir das Herz der Stadt.", "Jede Ecke erzählt eine andere Geschichte.", "Die Märkte öffnen vor Sonnenaufgang.", "Hier scheint die Zeit stillzustehen."],
  };
  const storage = getStorage();
  const now = Date.now();
  const day = 24 * 3600 * 1000;

  async function makeSegment(track: { id: string }, locale: "es" | "de", idx: number, externalId: string, actor: { id: string } | null, dueOffsetDays: number | null, state: "UNASSIGNED" | "ASSIGNED" | "SUBMITTED" | "CHANGES_REQUESTED" | "APPROVED") {
    const seg = await prisma.segment.create({
      data: { languageTrackId: track.id, externalId, startMs: 2500 + idx * 4000, endMs: 5900 + idx * 4000, script: lines[locale][idx % 4], notes: idx === 0 ? "Warm, inviting tone. Match the pacing of the source." : null, status: state === "UNASSIGNED" ? "UNASSIGNED" : "ASSIGNED" },
    });
    if (actor) {
      await prisma.assignment.create({ data: { segmentId: seg.id, actorUserId: actor.id, dueAt: dueOffsetDays === null ? null : new Date(now + dueOffsetDays * day), assignedById: manager.id } });
      await prisma.projectMember.upsert({ where: { projectId_userId: { projectId: project.id, userId: actor.id } }, update: {}, create: { projectId: project.id, userId: actor.id, role: "ACTOR" } });
    }
    if (state === "SUBMITTED" || state === "CHANGES_REQUESTED" || state === "APPROVED") {
      const versions = state === "SUBMITTED" ? 1 : 2;
      let lastId: string | null = null;
      for (let v = 1; v <= versions; v++) {
        const key = `org/${org.id}/segments/${seg.id}/seed-v${v}.wav`;
        const wav = synthWav({ seconds: 3.4 + v * 0.3, freq: locale === "es" ? 240 : 170, words: 8 });
        await storage.putObject(key, wav, "audio/wav");
        const rv = await prisma.recordingVersion.create({
          data: { segmentId: seg.id, versionNumber: v, uploaderId: actor!.id, origin: "ACTOR_UPLOAD", objectKey: key, mimeType: "audio/wav", originalFilename: `take-${v}.wav`, sizeBytes: wav.byteLength, durationMs: Math.round((3.4 + v * 0.3) * 1000), processingStatus: "READY", peaks: Array.from({ length: 200 }, (_, i) => Math.round((0.2 + 0.7 * Math.abs(Math.sin(i / 7 + v))) * 1000) / 1000), createdAt: new Date(now - (versions - v + 1) * day) },
        });
        lastId = rv.id;
        if (v === 1 && versions === 2) {
          await prisma.comment.create({ data: { recordingVersionId: rv.id, authorId: editor.id, timestampMs: 1200, body: "The first word feels rushed — give it a beat more.", createdAt: new Date(now - 1.5 * day) } });
          await prisma.comment.create({ data: { recordingVersionId: rv.id, authorId: editor.id, timestampMs: 2600, body: "Slight mouth click here; can you re-record from this point?", resolvedAt: new Date(now - day), resolvedById: actor!.id, createdAt: new Date(now - 1.5 * day) } });
          await prisma.reviewDecision.create({ data: { recordingVersionId: rv.id, reviewerId: editor.id, decision: "CHANGES_REQUESTED", reason: "Pacing on the opening line and a click at 00:02.", createdAt: new Date(now - 1.4 * day) } });
        }
      }
      const final = state === "APPROVED";
      if (final) await prisma.reviewDecision.create({ data: { recordingVersionId: lastId!, reviewerId: editor.id, decision: "APPROVED", createdAt: new Date(now - 0.5 * day) } });
      if (state === "CHANGES_REQUESTED") {
        await prisma.comment.create({ data: { recordingVersionId: lastId!, authorId: editor.id, timestampMs: 800, body: "Much better. Still a little flat on the second phrase — more energy.", createdAt: new Date(now - 0.3 * day) } });
        await prisma.reviewDecision.create({ data: { recordingVersionId: lastId!, reviewerId: editor.id, decision: "CHANGES_REQUESTED", reason: "More energy on the second phrase.", createdAt: new Date(now - 0.3 * day) } });
      }
      await prisma.segment.update({ where: { id: seg.id }, data: { currentVersionId: lastId, approvedVersionId: final ? lastId : null, status: state, revision: versions + 1 } });
    }
    return seg;
  }

  await makeSegment(tracks.ep1es, "es", 0, "E1-001", maria, 2, "SUBMITTED");
  await makeSegment(tracks.ep1es, "es", 1, "E1-002", maria, 2, "APPROVED");
  await makeSegment(tracks.ep1es, "es", 2, "E1-003", maria, -1, "CHANGES_REQUESTED");
  await makeSegment(tracks.ep1es, "es", 3, "E1-004", maria, 5, "ASSIGNED");
  await makeSegment(tracks.ep1de, "de", 0, "E1-001", jonas, 3, "SUBMITTED");
  await makeSegment(tracks.ep1de, "de", 1, "E1-002", jonas, 3, "ASSIGNED");
  await makeSegment(tracks.ep1de, "de", 2, "E1-003", jonas, -2, "ASSIGNED");
  await makeSegment(tracks.ep1de, "de", 3, "E1-004", null, null, "UNASSIGNED");
  await makeSegment(tracks.ep2es, "es", 0, "E2-001", maria, 9, "ASSIGNED");
  await makeSegment(tracks.ep2es, "es", 1, "E2-002", null, null, "UNASSIGNED");
  await makeSegment(tracks.ep2de, "de", 0, "E2-001", jonas, 9, "APPROVED");
  await makeSegment(tracks.ep2de, "de", 1, "E2-002", null, null, "UNASSIGNED");

  // Mock AI provider credential so "Generate AI draft" works offline.
  if (process.env.AI_MOCK_PROVIDER_ENABLED !== "false") {
    const enc = encryptSecret("mock-development-key");
    await prisma.aIProviderCredential.upsert({
      where: { organizationId_providerId: { organizationId: org.id, providerId: "mock" } },
      update: {},
      create: { organizationId: org.id, providerId: "mock", encryptedSecret: enc.ciphertext, keyVersion: enc.keyVersion, last4: safeLast4("mock-development-key"), enabled: true, isDefault: true, lastTestStatus: "SUCCESS", lastTestedAt: new Date(), lastTestMessage: "Mock provider connected", monthlyCharacterQuota: 200_000, updatedById: owner.id },
    });
  }

  await prisma.notification.createMany({
    data: [
      { userId: editor.id, type: "SUBMISSION_READY", title: "Version 1 ready for review", body: lines.es[0], resourceType: "Segment", resourceId: project.id, href: `/projects/${project.id}` },
      { userId: maria.id, type: "REVISION_REQUESTED", title: "Changes requested on version 2", body: "More energy on the second phrase.", resourceType: "Segment", resourceId: project.id, href: `/projects/${project.id}` },
    ],
  });
  await prisma.auditEvent.create({ data: { organizationId: org.id, actorId: manager.id, action: "project.created", entityType: "Project", entityId: project.id, metadata: { projectId: project.id, name: project.name } } });
  console.log(`Seeded organization "${org.name}" with project "${project.name}".`);
  console.log(`Sign in with owner@dubspace.test / ${SEED_PASSWORD} (also manager@, editor@, maria.actor@, jonas.actor@ dubspace.test).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

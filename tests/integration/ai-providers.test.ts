import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { clearDiscoveryCache, deleteProviderCredential, listProviderConfigs, listProviderModels, listProviderVoices, saveProviderCredential, testProviderCredential } from "@/server/services/ai-providers";
import { cancelGenerationJob, createGenerationJob, getGenerationJob } from "@/server/services/ai-generation";
import { drainJobs } from "@/server/queue/worker";
import { addMember, createOrgWithOwner, createProjectWithSegment, resetDatabase } from "../helpers/db";
import "../../workers/register";

describe("AI provider settings and generation", () => {
  let org: { id: string };
  let owner: { id: string };
  let editor: { id: string };
  let actor: { id: string };
  let segmentId: string;

  beforeAll(async () => {
    await resetDatabase();
    const created = await createOrgWithOwner();
    org = created.org;
    owner = created.owner;
    editor = await addMember(org.id, "EDITOR");
    actor = await addMember(org.id, "ACTOR");
    segmentId = (await createProjectWithSegment(org.id, owner.id)).segment.id;
    clearDiscoveryCache();
  });

  it("saves an encrypted key and never returns plaintext", async () => {
    const view = await saveProviderCredential({ userId: owner.id, organizationId: org.id, providerId: "mock", secret: "mock-super-secret-key-123", isDefault: true, monthlyCharacterQuota: 50 });
    expect(view.configured).toBe(true);
    expect(view.maskedKey).toBe("••••••••-123");
    expect(JSON.stringify(view)).not.toContain("mock-super-secret");
    const row = await prisma.aIProviderCredential.findFirstOrThrow({ where: { organizationId: org.id } });
    expect(row.encryptedSecret).not.toContain("mock-super-secret");
    expect(row.keyVersion).toBe("v1");
  });

  it("tests the connection server-side and records the result", async () => {
    const res = await testProviderCredential(owner.id, org.id, "mock");
    expect(res.ok).toBe(true);
    const view = (await listProviderConfigs(owner.id, org.id)).find((p) => p.providerId === "mock")!;
    expect(view.lastTestStatus).toBe("SUCCESS");
    await expect(testProviderCredential(editor.id, org.id, "mock")).rejects.toMatchObject({ status: 403 });
  });

  it("exposes voices and models to org members through the server", async () => {
    const voices = await listProviderVoices(editor.id, org.id, "mock");
    expect(voices.length).toBeGreaterThan(0);
    const models = await listProviderModels(editor.id, org.id, "mock");
    expect(models.some((m) => m.id === "mock-flash")).toBe(true);
  });

  it("enforces the quota guardrail", async () => {
    await expect(createGenerationJob({ userId: editor.id, segmentId, voiceId: "mock-alto", modelId: "mock-flash", text: "x".repeat(60) })).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
    await saveProviderCredential({ userId: owner.id, organizationId: org.id, providerId: "mock", monthlyCharacterQuota: null });
  });

  it("actors cannot generate; editors can, and the output becomes a reviewable AI version", async () => {
    await expect(createGenerationJob({ userId: actor.id, segmentId, voiceId: "mock-alto", modelId: "mock-flash" })).rejects.toMatchObject({ status: 404 });
    await expect(createGenerationJob({ userId: editor.id, segmentId, voiceId: "not-a-voice", modelId: "mock-flash" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const job = await createGenerationJob({ userId: editor.id, segmentId, voiceId: "mock-alto", modelId: "mock-flash", options: { speed: 1.5, bogus: 3 } });
    expect(job.status).toBe("QUEUED");
    await drainJobs("test"); // generate
    await drainJobs("test"); // process the produced recording
    const done = await getGenerationJob(editor.id, job.id);
    expect(done.status).toBe("SUCCEEDED");
    expect(done.outputRecording?.processingStatus).toBe("READY");
    const rv = await prisma.recordingVersion.findUniqueOrThrow({ where: { id: done.outputRecordingId! } });
    expect(rv.origin).toBe("AI_GENERATED");
    const seg = await prisma.segment.findUniqueOrThrow({ where: { id: segmentId } });
    expect(seg.status).toBe("SUBMITTED"); // never auto-approved
    const usage = await prisma.aIUsage.findFirst({ where: { organizationId: org.id, providerId: "mock" } });
    expect(usage?.requests).toBe(1);
    expect(usage?.characters).toBe(job.characterCount);
  });

  it("handles provider failures with retries and surfaces a failed job", async () => {
    await saveProviderCredential({ userId: owner.id, organizationId: org.id, providerId: "mock", secret: "mock-fail" });
    clearDiscoveryCache();
    const job = await createGenerationJob({ userId: editor.id, segmentId, voiceId: "mock-alto", modelId: "mock-flash" });
    await drainJobs("test");
    const after = await prisma.aIGenerationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(after.status).toBe("QUEUED"); // retryable error re-queued with backoff
    expect(after.errorCode).toBe("UNAVAILABLE");
    const bg = await prisma.backgroundJob.findFirstOrThrow({ where: { type: "ai.generate", payload: { path: ["jobId"], equals: job.id } } });
    expect(bg.status).toBe("PENDING");
    expect(bg.runAt.getTime()).toBeGreaterThan(Date.now());
    const cancelled = await cancelGenerationJob(editor.id, job.id);
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("deletes credentials (owner only) and then refuses generation", async () => {
    await expect(deleteProviderCredential(editor.id, org.id, "mock")).rejects.toMatchObject({ status: 403 });
    await deleteProviderCredential(owner.id, org.id, "mock");
    await expect(createGenerationJob({ userId: editor.id, segmentId, voiceId: "mock-alto", modelId: "mock-flash" })).rejects.toMatchObject({ code: "PROVIDER_NOT_CONFIGURED" });
    expect(await prisma.auditEvent.count({ where: { action: "provider.key_revoked" } })).toBe(1);
  });
});

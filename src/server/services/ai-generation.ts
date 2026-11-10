import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { recordAudit, emitOutbox } from "@/server/audit";
import { ApiError } from "@/server/errors";
import { can } from "@/server/authorization/policy";
import { requireSegmentAccess } from "@/server/authorization/access";
import { enqueueJob } from "@/server/queue";
import { getProviderAdapter } from "@/server/providers/registry";
import { availableProvidersForOrg, currentPeriod, listProviderModels, listProviderVoices, resolveProviderSecret } from "./ai-providers";
import { canUploadInStatus } from "./transitions";

const MAX_TEXT_CHARS = 5000;

export async function createGenerationJob(input: {
  userId: string;
  segmentId: string;
  providerId?: string;
  voiceId: string;
  modelId: string;
  text?: string;
  options?: Record<string, unknown>;
}) {
  const access = await requireSegmentAccess(input.userId, input.segmentId);
  if (!can.generateAi(access.level)) throw ApiError.forbidden("You are not allowed to generate AI drafts");
  const segment = await prisma.segment.findUniqueOrThrow({ where: { id: input.segmentId }, include: { languageTrack: true } });
  if (!canUploadInStatus(segment.status)) throw ApiError.invalidState("Reopen the segment before generating a new draft");

  const providers = await availableProvidersForOrg(access.organizationId);
  const providerId = input.providerId ?? providers[0]?.id;
  if (!providerId || !providers.some((p) => p.id === providerId)) throw new ApiError(409, "PROVIDER_NOT_CONFIGURED", "No enabled AI provider is configured for this organization");
  const adapter = getProviderAdapter(providerId);
  if (!adapter) throw ApiError.notFound("Unknown provider");

  const text = (input.text ?? segment.script).trim();
  if (!text) throw ApiError.validation("Text is empty");
  if (text.length > MAX_TEXT_CHARS) throw ApiError.validation(`Text exceeds ${MAX_TEXT_CHARS} characters`);

  const [voices, models] = await Promise.all([
    listProviderVoices(input.userId, access.organizationId, providerId),
    listProviderModels(input.userId, access.organizationId, providerId),
  ]);
  const voice = voices.find((v) => v.id === input.voiceId);
  if (!voice) throw ApiError.validation("Select a voice offered by the provider");
  const model = models.find((m) => m.id === input.modelId);
  if (!model) throw ApiError.validation("Select a model offered by the provider");
  if (model.maxCharacters && text.length > model.maxCharacters) throw ApiError.validation(`This model accepts at most ${model.maxCharacters} characters`);

  // Only pass through settings the adapter advertises.
  const allowed = new Set(adapter.capabilities().settings.map((s) => s.key));
  const options: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input.options ?? {})) {
    if (!allowed.has(k)) continue;
    const def = adapter.capabilities().settings.find((s) => s.key === k)!;
    if (def.type === "number" && typeof v === "number" && Number.isFinite(v)) options[k] = Math.min(def.max ?? v, Math.max(def.min ?? v, v));
    if (def.type === "boolean" && typeof v === "boolean") options[k] = v;
  }
  if (!model.supportsStyle) delete options.style;
  if (!model.supportsSpeakerBoost) delete options.useSpeakerBoost;
  options.languageCode = segment.languageTrack.locale.split("-")[0];

  // Quota guardrail (per organization, per provider, per calendar month).
  const resolved = await resolveProviderSecret(access.organizationId, providerId);
  if (!resolved) throw new ApiError(409, "PROVIDER_NOT_CONFIGURED", "Provider is not configured");
  if (resolved.quota) {
    const usage = await prisma.aIUsage.findUnique({ where: { organizationId_providerId_period: { organizationId: access.organizationId, providerId, period: currentPeriod() } } });
    if ((usage?.characters ?? 0) + text.length > resolved.quota) throw new ApiError(409, "QUOTA_EXCEEDED", "This generation would exceed the organization's monthly character budget");
  }

  return prisma.$transaction(async (tx) => {
    const job = await tx.aIGenerationJob.create({
      data: {
        organizationId: access.organizationId,
        projectId: access.projectId,
        segmentId: segment.id,
        requestedById: input.userId,
        providerId,
        modelId: model.id,
        voiceId: voice.id,
        voiceName: voice.name,
        text,
        options: options as Prisma.InputJsonValue,
        characterCount: text.length,
        status: "QUEUED",
      },
    });
    await enqueueJob(tx, "ai.generate", { jobId: job.id }, { idempotencyKey: `ai.generate:${job.id}`, maxAttempts: 4 });
    await recordAudit(tx, { organizationId: access.organizationId, actorId: input.userId, action: "ai.generation_requested", entityType: "AIGenerationJob", entityId: job.id, metadata: { projectId: access.projectId, segmentId: segment.id, providerId, modelId: model.id, voiceId: voice.id, characters: text.length } });
    await emitOutbox(tx, "ai_generation_requested", job.id, { organizationId: access.organizationId, segmentId: segment.id, providerId, characters: text.length });
    return job;
  });
}

export async function getGenerationJob(userId: string, jobId: string) {
  const job = await prisma.aIGenerationJob.findUnique({ where: { id: jobId }, include: { outputRecording: { select: { id: true, versionNumber: true, processingStatus: true } } } });
  if (!job) throw ApiError.notFound("Generation job not found");
  await requireSegmentAccess(userId, job.segmentId);
  return job;
}

export async function listGenerationJobs(userId: string, segmentId: string) {
  await requireSegmentAccess(userId, segmentId);
  return prisma.aIGenerationJob.findMany({ where: { segmentId }, orderBy: { createdAt: "desc" }, take: 20, include: { outputRecording: { select: { id: true, versionNumber: true, processingStatus: true } } } });
}

export async function cancelGenerationJob(userId: string, jobId: string) {
  const job = await getGenerationJob(userId, jobId);
  const access = await requireSegmentAccess(userId, job.segmentId);
  if (!can.generateAi(access.level)) throw ApiError.forbidden();
  if (job.status === "SUCCEEDED" || job.status === "FAILED" || job.status === "CANCELLED") throw ApiError.invalidState("Job already finished");
  return prisma.$transaction(async (tx) => {
    // Queued jobs cancel immediately; running jobs are cancelled cooperatively by the worker.
    const updated = await tx.aIGenerationJob.update({ where: { id: job.id }, data: job.status === "QUEUED" ? { status: "CANCELLED", cancelRequestedAt: new Date(), finishedAt: new Date() } : { cancelRequestedAt: new Date() } });
    await recordAudit(tx, { organizationId: access.organizationId, actorId: userId, action: "ai.generation_cancelled", entityType: "AIGenerationJob", entityId: job.id, metadata: { projectId: access.projectId, segmentId: job.segmentId } });
    return updated;
  });
}

export async function retryGenerationJob(userId: string, jobId: string) {
  const job = await getGenerationJob(userId, jobId);
  if (job.status !== "FAILED" && job.status !== "CANCELLED") throw ApiError.invalidState("Only failed or cancelled jobs can be retried");
  return createGenerationJob({ userId, segmentId: job.segmentId, providerId: job.providerId, voiceId: job.voiceId, modelId: job.modelId, text: job.text, options: (job.options as Record<string, unknown>) ?? {} });
}

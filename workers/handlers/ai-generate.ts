import { prisma } from "@/server/db/prisma";
import { recordAudit, emitOutbox } from "@/server/audit";
import { buildRecordingKey, getStorage } from "@/server/storage";
import { enqueueJob } from "@/server/queue";
import { registerJobHandler } from "@/server/queue/worker";
import { getProviderAdapter } from "@/server/providers/registry";
import { ProviderError } from "@/server/providers/types";
import { currentPeriod, resolveProviderSecret } from "@/server/services/ai-providers";
import { createNotification } from "@/server/services/notifications";

class NonRetryable extends Error {}

export async function runGenerationJob(jobId: string) {
  const job = await prisma.aIGenerationJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  if (job.status === "SUCCEEDED" || job.status === "CANCELLED") return;
  if (job.cancelRequestedAt) {
    await prisma.aIGenerationJob.update({ where: { id: job.id }, data: { status: "CANCELLED", finishedAt: new Date() } });
    return;
  }
  await prisma.aIGenerationJob.update({ where: { id: job.id }, data: { status: "RUNNING", startedAt: job.startedAt ?? new Date(), attemptCount: { increment: 1 } } });

  const finishFailed = async (code: string, message: string) => {
    await prisma.$transaction(async (tx) => {
      await tx.aIGenerationJob.update({ where: { id: job.id }, data: { status: "FAILED", errorCode: code, errorMessage: message.slice(0, 500), finishedAt: new Date() } });
      await recordAudit(tx, { organizationId: job.organizationId, actorId: job.requestedById, action: "ai.generation_failed", entityType: "AIGenerationJob", entityId: job.id, metadata: { projectId: job.projectId, segmentId: job.segmentId, providerId: job.providerId, code } });
      await emitOutbox(tx, "ai_generation_failed", job.id, { organizationId: job.organizationId, providerId: job.providerId, code });
      await createNotification(tx, { userId: job.requestedById, type: "GENERATION_FAILED", title: "AI draft failed", body: message.slice(0, 140), resourceType: "AIGenerationJob", resourceId: job.id, href: `/projects/${job.projectId}/segments/${job.segmentId}` });
    });
  };

  try {
    const adapter = getProviderAdapter(job.providerId);
    if (!adapter) throw new NonRetryable("Provider adapter is no longer available");
    const resolved = await resolveProviderSecret(job.organizationId, job.providerId);
    if (!resolved) throw new NonRetryable("Provider credential was removed or disabled");

    const result = await adapter.generateSpeech({ secret: resolved.secret, text: job.text, voiceId: job.voiceId, modelId: job.modelId, options: (job.options as Record<string, unknown>) ?? undefined });

    // Cooperative cancellation: if cancelled while generating, discard output.
    const fresh = await prisma.aIGenerationJob.findUniqueOrThrow({ where: { id: job.id }, select: { cancelRequestedAt: true } });
    if (fresh.cancelRequestedAt) {
      await prisma.aIGenerationJob.update({ where: { id: job.id }, data: { status: "CANCELLED", finishedAt: new Date() } });
      return;
    }

    const ext = result.mimeType === "audio/wav" ? "wav" : result.mimeType === "audio/mp4" ? "m4a" : "mp3";
    const key = buildRecordingKey(job.organizationId, job.segmentId, ext);
    await getStorage().putObject(key, result.audio, result.mimeType);

    await prisma.$transaction(async (tx) => {
      const last = await tx.recordingVersion.aggregate({ where: { segmentId: job.segmentId }, _max: { versionNumber: true } });
      const rv = await tx.recordingVersion.create({
        data: {
          segmentId: job.segmentId,
          versionNumber: (last._max.versionNumber ?? 0) + 1,
          uploaderId: job.requestedById,
          origin: "AI_GENERATED",
          objectKey: key,
          mimeType: result.mimeType,
          originalFilename: `ai-draft-${job.providerId}-${job.voiceName ?? job.voiceId}.${ext}`,
          sizeBytes: result.audio.byteLength,
          processingStatus: "UPLOADED",
        },
      });
      await tx.aIGenerationJob.update({ where: { id: job.id }, data: { status: "SUCCEEDED", outputRecordingId: rv.id, providerRequestId: result.providerRequestId ?? null, finishedAt: new Date(), errorCode: null, errorMessage: null } });
      await tx.aIUsage.upsert({
        where: { organizationId_providerId_period: { organizationId: job.organizationId, providerId: job.providerId, period: currentPeriod() } },
        update: { characters: { increment: job.characterCount }, requests: { increment: 1 } },
        create: { organizationId: job.organizationId, providerId: job.providerId, period: currentPeriod(), characters: job.characterCount, requests: 1 },
      });
      await enqueueJob(tx, "recording.process", { recordingVersionId: rv.id }, { idempotencyKey: `recording.process:${rv.id}` });
      await recordAudit(tx, { organizationId: job.organizationId, actorId: job.requestedById, action: "ai.generation_completed", entityType: "AIGenerationJob", entityId: job.id, metadata: { projectId: job.projectId, segmentId: job.segmentId, providerId: job.providerId, versionNumber: rv.versionNumber, characters: job.characterCount } });
      await emitOutbox(tx, "ai_generation_completed", job.id, { organizationId: job.organizationId, providerId: job.providerId, characters: job.characterCount });
      await createNotification(tx, { userId: job.requestedById, type: "GENERATION_COMPLETED", title: `AI draft v${rv.versionNumber} generated`, body: "Processing the audio now; it will appear as a new version shortly.", resourceType: "Segment", resourceId: job.segmentId, href: `/projects/${job.projectId}/segments/${job.segmentId}?version=${rv.id}` });
    });
  } catch (err) {
    if (err instanceof ProviderError) {
      if (err.retryable) {
        await prisma.aIGenerationJob.update({ where: { id: job.id }, data: { status: "QUEUED", errorCode: err.code, errorMessage: err.message.slice(0, 500) } });
        throw err; // let the queue retry with backoff
      }
      await finishFailed(err.code, err.message);
      return;
    }
    if (err instanceof NonRetryable) {
      await finishFailed("CONFIGURATION", err.message);
      return;
    }
    await prisma.aIGenerationJob.update({ where: { id: job.id }, data: { status: "QUEUED", errorCode: "UNKNOWN", errorMessage: (err instanceof Error ? err.message : String(err)).slice(0, 500) } });
    throw err;
  }
}

registerJobHandler<{ jobId: string }>("ai.generate", async (payload, job) => {
  try {
    await runGenerationJob(payload.jobId);
  } catch (err) {
    if (job.attempts >= job.maxAttempts) {
      const gen = await prisma.aIGenerationJob.findUnique({ where: { id: payload.jobId } });
      if (gen && gen.status !== "SUCCEEDED" && gen.status !== "CANCELLED") {
        await prisma.aIGenerationJob.update({ where: { id: gen.id }, data: { status: "FAILED", finishedAt: new Date(), errorMessage: `Gave up after ${job.attempts} attempts: ${gen.errorMessage ?? ""}`.slice(0, 500) } });
        await createNotification(prisma, { userId: gen.requestedById, type: "GENERATION_FAILED", title: "AI draft failed", body: gen.errorMessage ?? "Provider unavailable", resourceType: "AIGenerationJob", resourceId: gen.id, href: `/projects/${gen.projectId}/segments/${gen.segmentId}` });
      }
    }
    throw err;
  }
});

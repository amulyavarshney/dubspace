import { prisma } from "@/server/db/prisma";
import { getEnv } from "@/server/env";
import { recordAudit, emitOutbox } from "@/server/audit";
import { ApiError } from "@/server/errors";
import { can } from "@/server/authorization/policy";
import { requireRecordingAccess, requireSegmentAccess } from "@/server/authorization/access";
import { buildRecordingKey, extensionForMime, getStorage } from "@/server/storage";
import { enqueueJob } from "@/server/queue";
import { canUploadInStatus } from "./transitions";

const UPLOAD_URL_TTL_SECONDS = 15 * 60;
const PLAYBACK_URL_TTL_SECONDS = 10 * 60;

export async function createUploadIntent(input: {
  userId: string;
  segmentId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  idempotencyKey?: string;
}) {
  const env = getEnv();
  const access = await requireSegmentAccess(input.userId, input.segmentId);
  if (!can.upload(access.level)) throw ApiError.forbidden();
  if (access.level === "ACTOR" && !access.isActiveAssignee) throw ApiError.forbidden("Only the active assignee can upload to this segment");

  const ext = extensionForMime(input.mimeType);
  if (!ext) throw ApiError.validation("Unsupported audio type. Upload WAV, MP3 or M4A.");
  if (input.sizeBytes <= 0) throw ApiError.validation("File is empty");
  if (input.sizeBytes > env.MAX_UPLOAD_BYTES) throw new ApiError(413, "PAYLOAD_TOO_LARGE", `File exceeds the ${Math.round(env.MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit`);

  if (input.idempotencyKey) {
    const existing = await prisma.recordingVersion.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) {
      const upload = await getStorage().createUploadUrl({ key: existing.objectKey, contentType: existing.mimeType, contentLength: existing.sizeBytes ?? input.sizeBytes, ttlSeconds: UPLOAD_URL_TTL_SECONDS });
      return { recordingVersionId: existing.id, versionNumber: existing.versionNumber, upload };
    }
  }

  const segment = await prisma.segment.findUniqueOrThrow({ where: { id: input.segmentId } });
  if (!canUploadInStatus(segment.status)) throw ApiError.invalidState(`Cannot upload while the segment is ${segment.status.toLowerCase().replace("_", " ")}. Reopen it first.`);

  const key = buildRecordingKey(access.organizationId, segment.id, ext);
  const version = await prisma.$transaction(async (tx) => {
    const last = await tx.recordingVersion.aggregate({ where: { segmentId: segment.id }, _max: { versionNumber: true } });
    const rv = await tx.recordingVersion.create({
      data: {
        segmentId: segment.id,
        versionNumber: (last._max.versionNumber ?? 0) + 1,
        uploaderId: input.userId,
        origin: "ACTOR_UPLOAD",
        objectKey: key,
        mimeType: input.mimeType.toLowerCase(),
        originalFilename: input.filename.replace(/[\r\n"]/g, "").slice(0, 200),
        sizeBytes: input.sizeBytes,
        processingStatus: "PENDING_UPLOAD",
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });
    await recordAudit(tx, { organizationId: access.organizationId, actorId: input.userId, action: "recording.upload_started", entityType: "RecordingVersion", entityId: rv.id, metadata: { projectId: access.projectId, segmentId: segment.id, versionNumber: rv.versionNumber } });
    return rv;
  });
  const upload = await getStorage().createUploadUrl({ key, contentType: version.mimeType, contentLength: input.sizeBytes, ttlSeconds: UPLOAD_URL_TTL_SECONDS });
  return { recordingVersionId: version.id, versionNumber: version.versionNumber, upload };
}

export async function completeUpload(userId: string, recordingVersionId: string) {
  const access = await requireRecordingAccess(userId, recordingVersionId);
  const rv = await prisma.recordingVersion.findUniqueOrThrow({ where: { id: recordingVersionId } });
  if (rv.uploaderId !== userId && !can.manageProject(access.level)) throw ApiError.forbidden();
  if (rv.processingStatus === "READY" || rv.processingStatus === "PROCESSING") return rv;
  if (rv.processingStatus !== "PENDING_UPLOAD" && rv.processingStatus !== "FAILED") throw ApiError.invalidState("Recording is not awaiting upload");

  const meta = await getStorage().headObject(rv.objectKey);
  if (!meta) throw ApiError.validation("Upload not found in storage. Please retry the upload.");
  if (rv.sizeBytes && meta.size !== rv.sizeBytes) throw ApiError.validation("Uploaded object size does not match the declared size");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.recordingVersion.update({ where: { id: rv.id }, data: { processingStatus: "UPLOADED", processingError: null, sizeBytes: meta.size } });
    await enqueueJob(tx, "recording.process", { recordingVersionId: rv.id }, { idempotencyKey: `recording.process:${rv.id}:${Date.now()}` });
    await recordAudit(tx, { organizationId: access.organizationId, actorId: userId, action: "recording.uploaded", entityType: "RecordingVersion", entityId: rv.id, metadata: { projectId: access.projectId, segmentId: rv.segmentId, versionNumber: rv.versionNumber, sizeBytes: meta.size } });
    await emitOutbox(tx, "recording_uploaded", rv.id, { recordingVersionId: rv.id, segmentId: rv.segmentId, projectId: access.projectId });
    return updated;
  });
}

export async function getPlaybackUrl(userId: string, recordingVersionId: string) {
  await requireRecordingAccess(userId, recordingVersionId);
  const rv = await prisma.recordingVersion.findUniqueOrThrow({ where: { id: recordingVersionId } });
  if (rv.processingStatus !== "READY") throw ApiError.invalidState("Recording is not ready for playback");
  const url = await getStorage().createDownloadUrl({ key: rv.objectKey, ttlSeconds: PLAYBACK_URL_TTL_SECONDS, filename: rv.originalFilename ?? undefined, contentType: rv.mimeType });
  return { url, expiresAt: new Date(Date.now() + PLAYBACK_URL_TTL_SECONDS * 1000).toISOString(), mimeType: rv.mimeType, durationMs: rv.durationMs };
}

export async function getRecordingStatus(userId: string, recordingVersionId: string) {
  await requireRecordingAccess(userId, recordingVersionId);
  const rv = await prisma.recordingVersion.findUniqueOrThrow({ where: { id: recordingVersionId }, select: { id: true, processingStatus: true, processingError: true, durationMs: true, versionNumber: true, segment: { select: { status: true, revision: true } } } });
  return rv;
}

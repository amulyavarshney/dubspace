import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { prisma } from "@/server/db/prisma";
import { getEnv } from "@/server/env";
import { recordAudit, emitOutbox } from "@/server/audit";
import { getStorage } from "@/server/storage";
import { logger } from "@/server/log";
import { createNotification, reviewerUserIds } from "@/server/services/notifications";
import { registerJobHandler } from "@/server/queue/worker";

const execFileAsync = promisify(execFile);

export type AudioAnalysis = { durationMs: number | null; codec: string | null; peaks: number[] | null; valid: boolean; reason?: string };

let ffmpegAvailable: boolean | null = null;
async function hasFfmpeg(): Promise<boolean> {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  try {
    await execFileAsync("ffprobe", ["-version"]);
    await execFileAsync("ffmpeg", ["-version"]);
    ffmpegAvailable = true;
  } catch {
    ffmpegAvailable = false;
    logger.warn("ffmpeg/ffprobe not found; audio validation and waveform peaks are skipped");
  }
  return ffmpegAvailable;
}

/** Validates the real audio bytes with ffprobe and extracts ~400 waveform peaks via ffmpeg. */
export async function analyzeAudio(bytes: Uint8Array, ext: string): Promise<AudioAnalysis> {
  if (!(await hasFfmpeg())) return { durationMs: null, codec: null, peaks: null, valid: true, reason: "ffmpeg unavailable" };
  const dir = await mkdtemp(path.join(os.tmpdir(), "dubspace-"));
  const file = path.join(dir, `input.${ext}`);
  try {
    await writeFile(file, bytes);
    const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file], { maxBuffer: 4 * 1024 * 1024 });
    const info = JSON.parse(stdout) as { streams?: Array<{ codec_type: string; codec_name: string; duration?: string }>; format?: { duration?: string } };
    const audio = info.streams?.find((s) => s.codec_type === "audio");
    if (!audio) return { durationMs: null, codec: null, peaks: null, valid: false, reason: "File does not contain an audio stream" };
    const durationSec = Number(audio.duration ?? info.format?.duration ?? 0);
    const durationMs = Number.isFinite(durationSec) && durationSec > 0 ? Math.round(durationSec * 1000) : null;
    // Decode to 8 kHz mono 16-bit PCM and reduce to peaks.
    const { stdout: pcm } = await execFileAsync("ffmpeg", ["-v", "error", "-i", file, "-f", "s16le", "-ac", "1", "-ar", "8000", "pipe:1"], { encoding: "buffer", maxBuffer: 512 * 1024 * 1024 });
    const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
    return { durationMs: durationMs ?? Math.round((samples.length / 8000) * 1000), codec: audio.codec_name, peaks: computePeaks(samples, 400), valid: true };
  } catch (err) {
    return { durationMs: null, codec: null, peaks: null, valid: false, reason: err instanceof Error ? "Audio could not be decoded" : String(err) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function computePeaks(samples: Int16Array, buckets: number): number[] {
  if (samples.length === 0) return [];
  const size = Math.max(1, Math.floor(samples.length / buckets));
  const peaks: number[] = [];
  for (let i = 0; i < samples.length; i += size) {
    let max = 0;
    const end = Math.min(samples.length, i + size);
    for (let j = i; j < end; j++) {
      const v = Math.abs(samples[j]);
      if (v > max) max = v;
    }
    peaks.push(Math.round((max / 32768) * 1000) / 1000);
    if (peaks.length >= buckets) break;
  }
  return peaks;
}

export async function processRecording(recordingVersionId: string) {
  const env = getEnv();
  const rv = await prisma.recordingVersion.findUnique({ where: { id: recordingVersionId }, include: { segment: { include: { languageTrack: { include: { video: { select: { projectId: true, project: { select: { organizationId: true } } } } } } } } } });
  if (!rv) return;
  if (rv.processingStatus === "READY") return; // idempotent
  const projectId = rv.segment.languageTrack.video.projectId;
  const organizationId = rv.segment.languageTrack.video.project.organizationId;

  await prisma.recordingVersion.update({ where: { id: rv.id }, data: { processingStatus: "PROCESSING" } });
  const fail = async (reason: string) => {
    await prisma.$transaction(async (tx) => {
      await tx.recordingVersion.update({ where: { id: rv.id }, data: { processingStatus: "FAILED", processingError: reason } });
      await recordAudit(tx, { organizationId, actorId: rv.uploaderId, action: "recording.processing_failed", entityType: "RecordingVersion", entityId: rv.id, metadata: { projectId, segmentId: rv.segmentId, versionNumber: rv.versionNumber, reason } });
    });
  };

  const storage = getStorage();
  const meta = await storage.headObject(rv.objectKey);
  if (!meta) return fail("Uploaded file is missing from storage");
  if (meta.size > env.MAX_UPLOAD_BYTES) return fail("File exceeds the configured size limit");
  const bytes = await storage.getObject(rv.objectKey);
  const ext = rv.objectKey.split(".").pop() ?? "bin";
  const analysis = await analyzeAudio(bytes, ext);
  if (!analysis.valid) return fail(analysis.reason ?? "Invalid audio file");
  if (analysis.durationMs && analysis.durationMs > env.MAX_AUDIO_DURATION_MS) return fail(`Recording is longer than the ${Math.round(env.MAX_AUDIO_DURATION_MS / 60000)} minute limit`);

  await prisma.$transaction(async (tx) => {
    await tx.recordingVersion.update({ where: { id: rv.id }, data: { processingStatus: "READY", processingError: null, durationMs: analysis.durationMs, peaks: analysis.peaks ?? undefined, sizeBytes: meta.size } });
    const segment = await tx.segment.findUniqueOrThrow({ where: { id: rv.segmentId } });
    // A newer version may already be current; only move forward.
    const current = segment.currentVersionId ? await tx.recordingVersion.findUnique({ where: { id: segment.currentVersionId }, select: { versionNumber: true } }) : null;
    const becomesCurrent = !current || current.versionNumber < rv.versionNumber;
    if (becomesCurrent && segment.status !== "APPROVED") {
      await tx.segment.update({ where: { id: segment.id }, data: { currentVersionId: rv.id, status: "SUBMITTED", revision: { increment: 1 }, lastActivityAt: new Date() } });
    } else if (becomesCurrent) {
      // Approved segments keep their status; the new version is recorded but not authoritative until reopened.
      await tx.segment.update({ where: { id: segment.id }, data: { currentVersionId: rv.id, revision: { increment: 1 }, lastActivityAt: new Date() } });
    }
    await recordAudit(tx, { organizationId, actorId: rv.uploaderId, action: "recording.ready", entityType: "RecordingVersion", entityId: rv.id, metadata: { projectId, segmentId: rv.segmentId, versionNumber: rv.versionNumber, durationMs: analysis.durationMs, origin: rv.origin } });
    await emitOutbox(tx, "recording_ready", rv.id, { recordingVersionId: rv.id, segmentId: rv.segmentId, projectId, origin: rv.origin });
    if (becomesCurrent && segment.status !== "APPROVED") {
      const reviewers = await reviewerUserIds(tx, projectId, rv.uploaderId ?? undefined);
      for (const uid of reviewers.slice(0, 50)) {
        await createNotification(tx, {
          userId: uid,
          type: "SUBMISSION_READY",
          title: rv.origin === "AI_GENERATED" ? `AI draft v${rv.versionNumber} ready for review` : `Version ${rv.versionNumber} ready for review`,
          body: segment.script.slice(0, 140),
          resourceType: "Segment",
          resourceId: segment.id,
          href: `/projects/${projectId}/segments/${segment.id}?version=${rv.id}`,
        });
      }
    }
  });
}

registerJobHandler<{ recordingVersionId: string }>("recording.process", async (payload) => {
  await processRecording(payload.recordingVersionId);
});

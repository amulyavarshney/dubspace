import type { Prisma } from "@/generated/prisma/client";
import { prisma, type DbClient } from "@/server/db/prisma";

export type JobType =
  | "recording.process"
  | "ai.generate"
  | "outbox.dispatch"
  | "notifications.due-soon"
  | "storage.cleanup";

export type JobPayloads = {
  "recording.process": { recordingVersionId: string };
  "ai.generate": { jobId: string };
  "outbox.dispatch": { outboxEventId: string };
  "notifications.due-soon": Record<string, never>;
  "storage.cleanup": Record<string, never>;
};

export type ClaimedJob = {
  id: string;
  type: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
};

/**
 * Durable PostgreSQL-backed job queue. Jobs are enqueued inside the same transaction as
 * the domain change they belong to, so a committed write always has its job and a
 * rolled back write never leaves an orphan. Workers claim with `FOR UPDATE SKIP LOCKED`.
 */
export async function enqueueJob<T extends JobType>(
  db: DbClient,
  type: T,
  payload: JobPayloads[T],
  options: { runAt?: Date; idempotencyKey?: string; maxAttempts?: number } = {},
) {
  if (options.idempotencyKey) {
    const existing = await db.backgroundJob.findUnique({ where: { idempotencyKey: options.idempotencyKey } });
    if (existing) return existing;
  }
  return db.backgroundJob.create({
    data: {
      type,
      payload: payload as Prisma.InputJsonValue,
      runAt: options.runAt ?? new Date(),
      idempotencyKey: options.idempotencyKey,
      maxAttempts: options.maxAttempts ?? 5,
    },
  });
}

export async function claimJob(workerId: string): Promise<ClaimedJob | null> {
  // Timestamps are stored as UTC `timestamp(3)`; pass the current time as a parameter
  // rather than using `now()` so the comparison is not affected by the session time zone.
  const now = new Date();
  const rows = await prisma.$queryRaw<ClaimedJob[]>`
    UPDATE "BackgroundJob"
    SET status = 'RUNNING', "lockedAt" = ${now}, "lockedBy" = ${workerId}, attempts = attempts + 1, "updatedAt" = ${now}
    WHERE id = (
      SELECT id FROM "BackgroundJob"
      WHERE status = 'PENDING' AND "runAt" <= ${now}
      ORDER BY "runAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, type, payload, attempts, "maxAttempts"
  `;
  return rows[0] ?? null;
}

export async function completeJob(id: string) {
  await prisma.backgroundJob.update({ where: { id }, data: { status: "SUCCEEDED", lockedAt: null, lockedBy: null } });
}

export function backoffMs(attempt: number): number {
  return Math.min(5_000 * 2 ** Math.max(0, attempt - 1), 10 * 60_000);
}

export async function failJob(job: ClaimedJob, error: string) {
  const exhausted = job.attempts >= job.maxAttempts;
  await prisma.backgroundJob.update({
    where: { id: job.id },
    data: exhausted
      ? { status: "FAILED", lastError: error.slice(0, 2000), lockedAt: null, lockedBy: null }
      : {
          status: "PENDING",
          lastError: error.slice(0, 2000),
          lockedAt: null,
          lockedBy: null,
          runAt: new Date(Date.now() + backoffMs(job.attempts)),
        },
  });
  return exhausted;
}

/** Re-queue jobs whose worker died mid-run (lock older than 10 minutes). */
export async function recoverStaleJobs() {
  const cutoff = new Date(Date.now() - 10 * 60_000);
  await prisma.backgroundJob.updateMany({
    where: { status: "RUNNING", lockedAt: { lt: cutoff } },
    data: { status: "PENDING", lockedAt: null, lockedBy: null },
  });
}

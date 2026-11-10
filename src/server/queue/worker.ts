import { randomUUID } from "node:crypto";
import { getEnv } from "@/server/env";
import { logger } from "@/server/log";
import { claimJob, completeJob, failJob, recoverStaleJobs, type ClaimedJob } from "./index";

export type JobHandler = (payload: never, job: ClaimedJob) => Promise<void>;

const handlers = new Map<string, (payload: unknown, job: ClaimedJob) => Promise<void>>();

export function registerJobHandler<T>(type: string, handler: (payload: T, job: ClaimedJob) => Promise<void>) {
  handlers.set(type, handler as (payload: unknown, job: ClaimedJob) => Promise<void>);
}

export async function runOneJob(workerId = "inline"): Promise<boolean> {
  const job = await claimJob(workerId);
  if (!job) return false;
  const handler = handlers.get(job.type);
  if (!handler) {
    await failJob({ ...job, attempts: job.maxAttempts }, `No handler registered for job type ${job.type}`);
    return true;
  }
  try {
    await handler(job.payload, job);
    await completeJob(job.id);
    logger.info("job.succeeded", { jobId: job.id, type: job.type, attempt: job.attempts });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const exhausted = await failJob(job, message);
    logger.warn("job.failed", { jobId: job.id, type: job.type, attempt: job.attempts, exhausted, error: message });
  }
  return true;
}

/** Drain all currently runnable jobs (used by tests and by the inline worker tick). */
export async function drainJobs(workerId = "inline", max = 100): Promise<number> {
  let n = 0;
  while (n < max && (await runOneJob(workerId))) n++;
  return n;
}

let loopStarted = false;

export function startWorkerLoop(options: { pollIntervalMs?: number; workerId?: string } = {}) {
  if (loopStarted) return;
  loopStarted = true;
  const workerId = options.workerId ?? `worker-${randomUUID().slice(0, 8)}`;
  const interval = options.pollIntervalMs ?? getEnv().WORKER_POLL_INTERVAL_MS;
  logger.info("worker.started", { workerId, interval });

  let ticks = 0;
  const tick = async () => {
    try {
      if (ticks++ % 30 === 0) await recoverStaleJobs();
      await drainJobs(workerId, 20);
    } catch (err) {
      logger.error("worker.tick_error", { error: err instanceof Error ? err.message : String(err) });
    } finally {
      setTimeout(tick, interval).unref?.();
    }
  };
  void tick();
}

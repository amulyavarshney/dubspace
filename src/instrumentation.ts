export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { getEnv } = await import("@/server/env");
  const env = getEnv();
  if (!env.INLINE_WORKER) return;
  const { startWorkerLoop } = await import("@/server/queue/worker");
  const { scheduleRecurringJobs } = await import("../workers/register");
  const { logger } = await import("@/server/log");
  try {
    await scheduleRecurringJobs();
    setInterval(() => void scheduleRecurringJobs().catch((e) => logger.error("schedule.failed", { error: String(e) })), 60_000).unref();
    startWorkerLoop({ workerId: `inline-${Math.random().toString(36).slice(2, 8)}` });
  } catch (err) {
    logger.error("inline-worker.start_failed", { error: err instanceof Error ? err.message : String(err) });
  }
}

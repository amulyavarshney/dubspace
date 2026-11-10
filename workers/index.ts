import "dotenv/config";
import { startWorkerLoop } from "@/server/queue/worker";
import { logger } from "@/server/log";
import { scheduleRecurringJobs } from "./register";

/** Standalone worker process: `pnpm worker`. */
async function main() {
  await scheduleRecurringJobs();
  setInterval(() => void scheduleRecurringJobs().catch((e) => logger.error("schedule.failed", { error: String(e) })), 60_000).unref();
  startWorkerLoop({ workerId: `worker-${process.pid}` });
}

main().catch((err) => {
  logger.error("worker.fatal", { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});

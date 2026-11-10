import "./handlers/recording-process";
import "./handlers/ai-generate";
import "./handlers/outbox";
import "./handlers/due-soon";
import "./handlers/cleanup";
import { prisma } from "@/server/db/prisma";
import { enqueueJob } from "@/server/queue";

/** Ensures the recurring maintenance jobs exist (idempotent per hour). */
export async function scheduleRecurringJobs() {
  const hour = new Date().toISOString().slice(0, 13);
  await enqueueJob(prisma, "outbox.dispatch", { outboxEventId: "*" }, { idempotencyKey: `outbox.dispatch:${new Date().toISOString().slice(0, 16)}` });
  await enqueueJob(prisma, "notifications.due-soon", {}, { idempotencyKey: `due-soon:${hour}` });
  await enqueueJob(prisma, "storage.cleanup", {}, { idempotencyKey: `cleanup:${new Date().toISOString().slice(0, 10)}` });
}

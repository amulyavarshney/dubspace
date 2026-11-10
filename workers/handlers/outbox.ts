import { prisma } from "@/server/db/prisma";
import { getEmailTransport } from "@/server/notifications/email";
import { logger } from "@/server/log";
import { registerJobHandler } from "@/server/queue/worker";

/**
 * Drains the transactional outbox. Notification events become emails through the
 * configured transport; every other event is logged as an analytics event. Payloads
 * never contain audio, secrets or signed URLs.
 */
export async function dispatchOutbox(limit = 100): Promise<number> {
  const events = await prisma.outboxEvent.findMany({ where: { processedAt: null, attempts: { lt: 5 } }, orderBy: { createdAt: "asc" }, take: limit });
  let n = 0;
  for (const ev of events) {
    try {
      if (ev.type === "notification.created") {
        const payload = ev.payload as { notificationId: string };
        const notification = await prisma.notification.findUnique({ where: { id: payload.notificationId }, include: { user: { select: { email: true, name: true } } } });
        if (notification) {
          await getEmailTransport().send({
            to: notification.user.email,
            subject: `[Dubspace] ${notification.title}`,
            text: `${notification.body ?? ""}\n\nOpen: ${process.env.APP_BASE_URL ?? ""}${notification.href}`,
          });
        }
      } else {
        logger.info("analytics.event", { event: ev.type, aggregateId: ev.aggregateId, payload: ev.payload });
      }
      await prisma.outboxEvent.update({ where: { id: ev.id }, data: { processedAt: new Date() } });
      n++;
    } catch (err) {
      await prisma.outboxEvent.update({ where: { id: ev.id }, data: { attempts: { increment: 1 }, lastError: (err instanceof Error ? err.message : String(err)).slice(0, 500) } });
    }
  }
  return n;
}

registerJobHandler("outbox.dispatch", async () => {
  await dispatchOutbox();
});

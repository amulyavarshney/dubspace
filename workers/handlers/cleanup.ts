import { prisma } from "@/server/db/prisma";
import { getStorage } from "@/server/storage";
import { registerJobHandler } from "@/server/queue/worker";

/** Removes recording versions whose upload never completed (older than 24h). */
export async function cleanupAbandonedUploads(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000);
  const stale = await prisma.recordingVersion.findMany({ where: { processingStatus: "PENDING_UPLOAD", createdAt: { lt: cutoff } }, take: 200 });
  for (const rv of stale) {
    try {
      await getStorage().deleteObject(rv.objectKey);
    } catch {
      /* object may not exist */
    }
    await prisma.recordingVersion.delete({ where: { id: rv.id } });
  }
  return stale.length;
}

registerJobHandler("storage.cleanup", async () => {
  await cleanupAbandonedUploads();
});

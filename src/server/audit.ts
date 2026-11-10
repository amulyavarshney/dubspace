import type { Prisma } from "@/generated/prisma/client";
import type { DbClient } from "@/server/db/prisma";

export type AuditInput = {
  organizationId: string;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
};

export async function recordAudit(db: DbClient, input: AuditInput) {
  return db.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function emitOutbox(db: DbClient, type: string, aggregateId: string, payload: Record<string, unknown>) {
  return db.outboxEvent.create({ data: { type, aggregateId, payload: payload as Prisma.InputJsonValue } });
}

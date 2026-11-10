import { prisma } from "@/server/db/prisma";
import { getEnv } from "@/server/env";
import { recordAudit, emitOutbox } from "@/server/audit";
import { ApiError } from "@/server/errors";
import { decryptSecret, encryptSecret, maskSecret, safeLast4 } from "@/server/crypto/secrets";
import { requireOrgOwner, requireOrgRole } from "@/server/authorization/access";
import { getProviderAdapter, listProviderAdapters } from "@/server/providers/registry";
import type { ProviderModel, ProviderVoice } from "@/server/providers/types";

export type ProviderConfigView = {
  providerId: string;
  name: string;
  description: string;
  configured: boolean;
  enabled: boolean;
  isDefault: boolean;
  maskedKey: string | null;
  lastTestStatus: "NEVER" | "SUCCESS" | "FAILED";
  lastTestedAt: string | null;
  lastTestMessage: string | null;
  updatedAt: string | null;
  monthlyCharacterQuota: number | null;
  usage: { period: string; characters: number; requests: number };
  /** True when the server-only env fallback is active for this provider (never exposes the value). */
  environmentFallback: boolean;
  capabilities: ReturnType<ReturnType<typeof listProviderAdapters>[number]["capabilities"]>;
};

export function currentPeriod(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Masked configuration for all registered providers. Never includes secrets. */
export async function listProviderConfigs(userId: string, organizationId: string): Promise<ProviderConfigView[]> {
  await requireOrgRole(userId, organizationId);
  const env = getEnv();
  const [creds, usage] = await Promise.all([
    prisma.aIProviderCredential.findMany({ where: { organizationId } }),
    prisma.aIUsage.findMany({ where: { organizationId, period: currentPeriod() } }),
  ]);
  return listProviderAdapters().map((adapter) => {
    const c = creds.find((x) => x.providerId === adapter.id);
    const u = usage.find((x) => x.providerId === adapter.id);
    const envFallback = adapter.id === "elevenlabs" && env.AI_PROVIDER_ENV_FALLBACK_ENABLED && !!env.ELEVENLABS_API_KEY && !c;
    return {
      providerId: adapter.id,
      name: adapter.name,
      description: adapter.description,
      configured: !!c || envFallback,
      enabled: c?.enabled ?? envFallback,
      isDefault: c?.isDefault ?? false,
      maskedKey: c ? maskSecret(c.last4) : null,
      lastTestStatus: c?.lastTestStatus ?? "NEVER",
      lastTestedAt: c?.lastTestedAt?.toISOString() ?? null,
      lastTestMessage: c?.lastTestMessage ?? null,
      updatedAt: c?.updatedAt.toISOString() ?? null,
      monthlyCharacterQuota: c?.monthlyCharacterQuota ?? null,
      usage: { period: currentPeriod(), characters: u?.characters ?? 0, requests: u?.requests ?? 0 },
      environmentFallback: envFallback,
      capabilities: adapter.capabilities(),
    };
  });
}

export async function saveProviderCredential(input: {
  userId: string;
  organizationId: string;
  providerId: string;
  secret?: string;
  enabled?: boolean;
  isDefault?: boolean;
  monthlyCharacterQuota?: number | null;
}) {
  await requireOrgOwner(input.userId, input.organizationId);
  const adapter = getProviderAdapter(input.providerId);
  if (!adapter) throw ApiError.notFound("Unknown provider");
  const existing = await prisma.aIProviderCredential.findUnique({ where: { organizationId_providerId: { organizationId: input.organizationId, providerId: input.providerId } } });
  if (!existing && !input.secret) throw ApiError.validation("An API key is required to configure this provider");
  if (input.secret !== undefined) {
    const s = input.secret.trim();
    if (s.length < 8 || s.length > 512) throw ApiError.validation("API key looks invalid");
    if (/\s/.test(s)) throw ApiError.validation("API key must not contain whitespace");
  }

  const result = await prisma.$transaction(async (tx) => {
    const enc = input.secret ? encryptSecret(input.secret.trim()) : null;
    const data = {
      ...(enc ? { encryptedSecret: enc.ciphertext, keyVersion: enc.keyVersion, last4: safeLast4(input.secret!.trim()), lastTestStatus: "NEVER" as const, lastTestedAt: null, lastTestMessage: null } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.monthlyCharacterQuota !== undefined ? { monthlyCharacterQuota: input.monthlyCharacterQuota } : {}),
      updatedById: input.userId,
    };
    const cred = existing
      ? await tx.aIProviderCredential.update({ where: { id: existing.id }, data })
      : await tx.aIProviderCredential.create({ data: { organizationId: input.organizationId, providerId: input.providerId, encryptedSecret: enc!.ciphertext, keyVersion: enc!.keyVersion, last4: safeLast4(input.secret!.trim()), enabled: input.enabled ?? true, monthlyCharacterQuota: input.monthlyCharacterQuota ?? null, updatedById: input.userId } });
    if (input.isDefault) {
      await tx.aIProviderCredential.updateMany({ where: { organizationId: input.organizationId }, data: { isDefault: false } });
      await tx.aIProviderCredential.update({ where: { id: cred.id }, data: { isDefault: true } });
    } else if (input.isDefault === false) {
      await tx.aIProviderCredential.update({ where: { id: cred.id }, data: { isDefault: false } });
    }
    await recordAudit(tx, {
      organizationId: input.organizationId,
      actorId: input.userId,
      action: existing ? (input.secret ? "provider.key_replaced" : "provider.updated") : "provider.configured",
      entityType: "AIProviderCredential",
      entityId: cred.id,
      metadata: { providerId: input.providerId, enabled: input.enabled, isDefault: input.isDefault, quota: input.monthlyCharacterQuota, keyVersion: cred.keyVersion },
    });
    await emitOutbox(tx, "provider_configured", cred.id, { organizationId: input.organizationId, providerId: input.providerId });
    return cred;
  });
  return (await listProviderConfigs(input.userId, input.organizationId)).find((p) => p.providerId === result.providerId)!;
}

export async function deleteProviderCredential(userId: string, organizationId: string, providerId: string) {
  await requireOrgOwner(userId, organizationId);
  const existing = await prisma.aIProviderCredential.findUnique({ where: { organizationId_providerId: { organizationId, providerId } } });
  if (!existing) throw ApiError.notFound("Provider is not configured");
  await prisma.$transaction(async (tx) => {
    await tx.aIProviderCredential.delete({ where: { id: existing.id } });
    await recordAudit(tx, { organizationId, actorId: userId, action: "provider.key_revoked", entityType: "AIProviderCredential", entityId: existing.id, metadata: { providerId } });
  });
}

export type ResolvedSecret = { secret: string; source: "organization" | "environment"; credentialId: string | null; quota: number | null };

/**
 * Decrypts the organization's credential for server-side adapter use only. Never return
 * the result of this function from an API handler.
 */
export async function resolveProviderSecret(organizationId: string, providerId: string): Promise<ResolvedSecret | null> {
  const cred = await prisma.aIProviderCredential.findUnique({ where: { organizationId_providerId: { organizationId, providerId } } });
  if (cred) {
    if (!cred.enabled) return null;
    return { secret: decryptSecret(cred.encryptedSecret), source: "organization", credentialId: cred.id, quota: cred.monthlyCharacterQuota };
  }
  const env = getEnv();
  if (providerId === "elevenlabs" && env.AI_PROVIDER_ENV_FALLBACK_ENABLED && env.ELEVENLABS_API_KEY) {
    return { secret: env.ELEVENLABS_API_KEY, source: "environment", credentialId: null, quota: null };
  }
  return null;
}

export async function testProviderCredential(userId: string, organizationId: string, providerId: string) {
  await requireOrgOwner(userId, organizationId);
  const adapter = getProviderAdapter(providerId);
  if (!adapter) throw ApiError.notFound("Unknown provider");
  const resolved = await resolveProviderSecret(organizationId, providerId);
  if (!resolved) throw new ApiError(409, "PROVIDER_NOT_CONFIGURED", "Provider is not configured or is disabled");
  const result = await adapter.validateCredential(resolved.secret);
  const message = (result.message ?? (result.ok ? "Connected" : "Connection failed")).slice(0, 300);
  if (resolved.credentialId) {
    await prisma.aIProviderCredential.update({ where: { id: resolved.credentialId }, data: { lastTestStatus: result.ok ? "SUCCESS" : "FAILED", lastTestedAt: new Date(), lastTestMessage: message } });
  }
  await recordAudit(prisma, { organizationId, actorId: userId, action: "provider.tested", entityType: "AIProviderCredential", entityId: resolved.credentialId ?? providerId, metadata: { providerId, ok: result.ok } });
  await emitOutbox(prisma, "provider_tested", resolved.credentialId ?? providerId, { organizationId, providerId, ok: result.ok });
  return { ok: result.ok, message };
}

const discoveryCache = new Map<string, { at: number; voices?: ProviderVoice[]; models?: ProviderModel[] }>();
const DISCOVERY_TTL_MS = 5 * 60_000;

async function requireProviderForOrgMember(userId: string, organizationId: string, providerId: string) {
  await requireOrgRole(userId, organizationId);
  const adapter = getProviderAdapter(providerId);
  if (!adapter) throw ApiError.notFound("Unknown provider");
  const resolved = await resolveProviderSecret(organizationId, providerId);
  if (!resolved) throw new ApiError(409, "PROVIDER_NOT_CONFIGURED", "Provider is not configured for this organization");
  return { adapter, resolved };
}

export async function listProviderVoices(userId: string, organizationId: string, providerId: string): Promise<ProviderVoice[]> {
  const { adapter, resolved } = await requireProviderForOrgMember(userId, organizationId, providerId);
  const key = `${organizationId}:${providerId}:voices`;
  const cached = discoveryCache.get(key);
  if (cached?.voices && Date.now() - cached.at < DISCOVERY_TTL_MS) return cached.voices;
  try {
    const voices = await adapter.listVoices(resolved.secret);
    discoveryCache.set(key, { at: Date.now(), voices });
    return voices;
  } catch (err) {
    throw new ApiError(502, "PROVIDER_ERROR", err instanceof Error ? err.message : "Provider request failed");
  }
}

export async function listProviderModels(userId: string, organizationId: string, providerId: string): Promise<ProviderModel[]> {
  const { adapter, resolved } = await requireProviderForOrgMember(userId, organizationId, providerId);
  const key = `${organizationId}:${providerId}:models`;
  const cached = discoveryCache.get(key);
  if (cached?.models && Date.now() - cached.at < DISCOVERY_TTL_MS) return cached.models;
  try {
    const models = await adapter.listModels(resolved.secret);
    discoveryCache.set(key, { at: Date.now(), models });
    return models;
  } catch (err) {
    throw new ApiError(502, "PROVIDER_ERROR", err instanceof Error ? err.message : "Provider request failed");
  }
}

export function clearDiscoveryCache() {
  discoveryCache.clear();
}

/** Providers that are configured and enabled for an org (for the generate dialog). */
export async function availableProvidersForOrg(organizationId: string) {
  const env = getEnv();
  const creds = await prisma.aIProviderCredential.findMany({ where: { organizationId, enabled: true } });
  const out = listProviderAdapters()
    .filter((a) => creds.some((c) => c.providerId === a.id) || (a.id === "elevenlabs" && env.AI_PROVIDER_ENV_FALLBACK_ENABLED && !!env.ELEVENLABS_API_KEY))
    .map((a) => ({ id: a.id, name: a.name, isDefault: creds.find((c) => c.providerId === a.id)?.isDefault ?? false, capabilities: a.capabilities() }));
  return out.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

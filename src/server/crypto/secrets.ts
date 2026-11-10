import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/server/env";

/**
 * Envelope-style authenticated encryption for provider credentials.
 *
 * Format: `<keyVersion>.<nonce b64url>.<ciphertext b64url>.<tag b64url>`
 * Algorithm: AES-256-GCM, random 12-byte nonce per secret, key version as AAD.
 *
 * In production the data key should come from a KMS-managed secret; locally it is a
 * base64 32-byte key held in an environment variable outside the database.
 */

const ALG = "aes-256-gcm";

function decodeKey(b64: string, label: string): Buffer {
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error(`${label} must be a base64-encoded 32-byte key`);
  }
  return key;
}

function keyring(): Map<string, Buffer> {
  const env = getEnv();
  const ring = new Map<string, Buffer>();
  ring.set(env.CREDENTIAL_ENCRYPTION_KEY_VERSION, decodeKey(env.CREDENTIAL_ENCRYPTION_KEY, "CREDENTIAL_ENCRYPTION_KEY"));
  if (env.CREDENTIAL_ENCRYPTION_KEY_PREVIOUS && env.CREDENTIAL_ENCRYPTION_KEY_PREVIOUS_VERSION) {
    ring.set(
      env.CREDENTIAL_ENCRYPTION_KEY_PREVIOUS_VERSION,
      decodeKey(env.CREDENTIAL_ENCRYPTION_KEY_PREVIOUS, "CREDENTIAL_ENCRYPTION_KEY_PREVIOUS"),
    );
  }
  return ring;
}

export function currentKeyVersion(): string {
  return getEnv().CREDENTIAL_ENCRYPTION_KEY_VERSION;
}

export function encryptSecret(plaintext: string): { ciphertext: string; keyVersion: string } {
  const version = currentKeyVersion();
  const key = keyring().get(version)!;
  const nonce = randomBytes(12);
  const cipher = createCipheriv(ALG, key, nonce);
  cipher.setAAD(Buffer.from(version, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: [version, nonce.toString("base64url"), ct.toString("base64url"), tag.toString("base64url")].join("."),
    keyVersion: version,
  };
}

export function decryptSecret(ciphertext: string): string {
  const parts = ciphertext.split(".");
  if (parts.length !== 4) throw new Error("Malformed encrypted secret");
  const [version, nonceB64, ctB64, tagB64] = parts;
  const key = keyring().get(version);
  if (!key) throw new Error(`No encryption key available for version ${version}`);
  const decipher = createDecipheriv(ALG, key, Buffer.from(nonceB64, "base64url"));
  decipher.setAAD(Buffer.from(version, "utf8"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64url")), decipher.final()]);
  return pt.toString("utf8");
}

/** Returns the last 4 characters when the secret is long enough to make that safe. */
export function safeLast4(secret: string): string | null {
  return secret.length >= 16 ? secret.slice(-4) : null;
}

export function maskSecret(last4: string | null): string {
  return `••••••••${last4 ?? "••••"}`;
}

export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, maskSecret, safeLast4 } from "@/server/crypto/secrets";
import { redact } from "@/server/log";

describe("credential encryption", () => {
  it("round-trips and uses a random nonce", () => {
    const a = encryptSecret("sk_test_1234567890abcdef");
    const b = encryptSecret("sk_test_1234567890abcdef");
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.keyVersion).toBe("v1");
    expect(decryptSecret(a.ciphertext)).toBe("sk_test_1234567890abcdef");
    expect(decryptSecret(b.ciphertext)).toBe("sk_test_1234567890abcdef");
  });
  it("fails on tampering", () => {
    const { ciphertext } = encryptSecret("secret-value-here");
    const parts = ciphertext.split(".");
    parts[2] = parts[2].slice(0, -2) + (parts[2].endsWith("A") ? "BB" : "AA");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });
  it("never includes the plaintext", () => {
    const { ciphertext } = encryptSecret("plaintext-marker-xyz");
    expect(ciphertext.includes("plaintext-marker")).toBe(false);
  });
  it("masks safely", () => {
    expect(safeLast4("short")).toBeNull();
    expect(safeLast4("sk_1234567890abcdefgh")).toBe("efgh");
    expect(maskSecret("efgh")).toBe("••••••••efgh");
    expect(maskSecret(null)).toBe("••••••••••••");
  });
});

describe("log redaction", () => {
  it("redacts secret-looking keys and tokens", () => {
    const out = redact({ apiKey: "abc", nested: { password: "x", ok: "Bearer abcdef.ghij" }, text: "sk_live_abcdefghijklmnop" }) as Record<string, unknown>;
    expect(out.apiKey).toBe("[REDACTED]");
    expect((out.nested as Record<string, unknown>).password).toBe("[REDACTED]");
    expect((out.nested as Record<string, unknown>).ok).toBe("[REDACTED]");
    expect(out.text).toBe("[REDACTED]");
  });
});

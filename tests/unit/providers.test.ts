import { describe, expect, it } from "vitest";
import { ElevenLabsError } from "@elevenlabs/elevenlabs-js";
import { mapError } from "@/server/providers/elevenlabs/adapter";
import { MockProviderAdapter } from "@/server/providers/mock/adapter";

describe("ElevenLabs error mapping", () => {
  it("maps status codes to sanitized provider errors", () => {
    expect(mapError(new ElevenLabsError({ message: "nope", statusCode: 401, body: { detail: "super secret" } })).code).toBe("INVALID_CREDENTIAL");
    expect(mapError(new ElevenLabsError({ message: "slow", statusCode: 429 })).retryable).toBe(true);
    expect(mapError(new ElevenLabsError({ message: "bad", statusCode: 422 })).code).toBe("INVALID_INPUT");
    expect(mapError(new ElevenLabsError({ message: "down", statusCode: 503 })).code).toBe("UNAVAILABLE");
    const e = mapError(new ElevenLabsError({ message: "with key xi-api-key=abc", statusCode: 400 }));
    expect(e.message).not.toContain("xi-api-key");
  });
  it("treats network failures as retryable", () => {
    expect(mapError(new Error("fetch failed ECONNREFUSED")).retryable).toBe(true);
  });
});

describe("mock provider", () => {
  const mock = new MockProviderAdapter();
  it("validates keys", async () => {
    expect((await mock.validateCredential("mock-ok")).ok).toBe(true);
    expect((await mock.validateCredential("nope")).ok).toBe(false);
    expect((await mock.validateCredential("mock-fail")).ok).toBe(false);
  });
  it("generates a deterministic WAV", async () => {
    const a = await mock.generateSpeech({ secret: "mock-x", text: "Hello there world", voiceId: "mock-alto", modelId: "mock-flash" });
    const b = await mock.generateSpeech({ secret: "mock-x", text: "Hello there world", voiceId: "mock-alto", modelId: "mock-flash" });
    expect(a.mimeType).toBe("audio/wav");
    expect(Buffer.from(a.audio.slice(0, 4)).toString()).toBe("RIFF");
    expect(a.providerRequestId).toBe(b.providerRequestId);
    expect(a.audio.byteLength).toBe(b.audio.byteLength);
  });
  it("rejects unknown voices", async () => {
    await expect(mock.generateSpeech({ secret: "mock-x", text: "hi", voiceId: "nope", modelId: "m" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});

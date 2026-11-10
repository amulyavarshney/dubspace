import type { AIProviderAdapter, ProviderCapabilities, ProviderModel, ProviderVoice } from "../types";
import { ProviderError } from "../types";

/**
 * Deterministic offline provider for development and CI. Produces a WAV tone whose
 * pitch depends on the voice and whose length scales with the text. Any secret that
 * starts with `mock-` is accepted; `mock-fail` simulates a provider outage.
 */
export class MockProviderAdapter implements AIProviderAdapter {
  readonly id = "mock";
  readonly name = "Mock provider";
  readonly description = "Offline deterministic provider for development and tests. Generates synthetic tones instead of speech.";

  capabilities(): ProviderCapabilities {
    return {
      costEstimateAvailable: true,
      outputMimeType: "audio/wav",
      settings: [
        { key: "speed", label: "Speed", type: "number", min: 0.5, max: 2, step: 0.1, default: 1 },
        { key: "stability", label: "Stability", type: "number", min: 0, max: 1, step: 0.1, default: 0.5 },
      ],
    };
  }

  async validateCredential(secret: string) {
    if (secret === "mock-fail") return { ok: false, message: "Mock provider is simulating an outage" };
    if (!secret.startsWith("mock-")) return { ok: false, message: "Mock keys must start with mock-" };
    return { ok: true, message: "Mock provider connected" };
  }

  async listVoices(secret: string): Promise<ProviderVoice[]> {
    this.assertKey(secret);
    return [
      { id: "mock-alto", name: "Alto (mock)", category: "premade", description: "Warm mid-range tone", languages: ["en", "es"] },
      { id: "mock-bass", name: "Bass (mock)", category: "premade", description: "Low register tone", languages: ["en", "de"] },
      { id: "mock-soprano", name: "Soprano (mock)", category: "premade", description: "Bright high tone", languages: ["en", "fr", "ja"] },
    ];
  }

  async listModels(secret: string): Promise<ProviderModel[]> {
    this.assertKey(secret);
    return [
      { id: "mock-multilingual-v1", name: "Mock Multilingual v1", description: "Deterministic tone generator", maxCharacters: 5000, supportsStyle: true, supportsSpeakerBoost: true },
      { id: "mock-flash", name: "Mock Flash", description: "Faster, shorter output", maxCharacters: 2000, supportsStyle: false, supportsSpeakerBoost: false },
    ];
  }

  async generateSpeech(input: { secret: string; text: string; voiceId: string; modelId: string; options?: Record<string, unknown> }) {
    this.assertKey(input.secret);
    if (input.secret === "mock-fail") throw new ProviderError("UNAVAILABLE", "Mock provider outage", true);
    if (!input.text.trim()) throw new ProviderError("INVALID_INPUT", "Text is empty", false);
    const voices = await this.listVoices(input.secret);
    if (!voices.some((v) => v.id === input.voiceId)) throw new ProviderError("INVALID_INPUT", "Unknown voice", false);
    const speed = typeof input.options?.speed === "number" ? (input.options.speed as number) : 1;
    const freq = input.voiceId === "mock-bass" ? 140 : input.voiceId === "mock-soprano" ? 520 : 260;
    const seconds = Math.min(60, Math.max(0.8, (input.text.length * 0.06) / speed));
    return { audio: synthWav({ seconds, freq, words: input.text.split(/\s+/).length }), mimeType: "audio/wav", providerRequestId: `mock-${hash(input.text + input.voiceId)}` };
  }

  private assertKey(secret: string) {
    if (!secret.startsWith("mock-")) throw new ProviderError("INVALID_CREDENTIAL", "Invalid mock key", false);
  }
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}

/** 16-bit mono PCM WAV with word-like amplitude envelopes so waveforms look plausible. */
export function synthWav(opts: { seconds: number; freq: number; words: number; sampleRate?: number }): Uint8Array {
  const sr = opts.sampleRate ?? 16000;
  const n = Math.floor(opts.seconds * sr);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  const wordLen = n / Math.max(1, opts.words);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const phase = (i % wordLen) / wordLen;
    const env = Math.sin(Math.PI * phase) ** 2 * (0.6 + 0.4 * Math.sin(t * 3));
    const sample = Math.sin(2 * Math.PI * opts.freq * t) * 0.6 + Math.sin(2 * Math.PI * opts.freq * 2.01 * t) * 0.2;
    buf.writeInt16LE(Math.round(sample * env * 0.7 * 32767), 44 + i * 2);
  }
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
}

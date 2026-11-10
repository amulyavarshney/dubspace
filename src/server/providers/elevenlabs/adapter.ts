import { ElevenLabsClient, ElevenLabsError } from "@elevenlabs/elevenlabs-js";
import type { AIProviderAdapter, ProviderCapabilities, ProviderModel, ProviderVoice } from "../types";
import { ProviderError } from "../types";

/**
 * ElevenLabs adapter built on the official `@elevenlabs/elevenlabs-js` SDK.
 *
 * Endpoints used (SDK method -> REST):
 *  - client.user.get()                  -> GET  /v1/user           (credential validation)
 *  - client.voices.search()             -> GET  /v2/voices         (voice discovery)
 *  - client.models.list()               -> GET  /v1/models         (model discovery)
 *  - client.textToSpeech.convert()      -> POST /v1/text-to-speech/{voice_id}
 *
 * Only models that report `canDoTextToSpeech` are exposed; voice settings are passed
 * through as `voiceSettings` and `style`/`useSpeakerBoost` are only shown for models
 * that advertise support.
 */
export class ElevenLabsAdapter implements AIProviderAdapter {
  readonly id = "elevenlabs";
  readonly name = "ElevenLabs";
  readonly description = "Text to speech drafts using your organization's ElevenLabs API key.";

  private client(secret: string) {
    return new ElevenLabsClient({ apiKey: secret });
  }

  capabilities(): ProviderCapabilities {
    return {
      costEstimateAvailable: false,
      outputMimeType: "audio/mpeg",
      settings: [
        { key: "stability", label: "Stability", type: "number", min: 0, max: 1, step: 0.05, default: 0.5, description: "Higher values are steadier, lower values are more expressive." },
        { key: "similarityBoost", label: "Similarity", type: "number", min: 0, max: 1, step: 0.05, default: 0.75 },
        { key: "style", label: "Style exaggeration", type: "number", min: 0, max: 1, step: 0.05, default: 0, description: "Only applied for models that support style." },
        { key: "speed", label: "Speed", type: "number", min: 0.7, max: 1.2, step: 0.05, default: 1 },
        { key: "useSpeakerBoost", label: "Speaker boost", type: "boolean", default: true },
      ],
    };
  }

  async validateCredential(secret: string) {
    try {
      const user = await this.client(secret).user.get();
      const sub = user.subscription;
      const remaining = sub ? Math.max(0, sub.characterLimit - sub.characterCount) : null;
      return { ok: true, message: remaining === null ? "Connected" : `Connected. ${remaining.toLocaleString()} characters remaining this period (${sub?.tier ?? "unknown"} tier).` };
    } catch (err) {
      const mapped = mapError(err);
      return { ok: false, message: mapped.message };
    }
  }

  async listVoices(secret: string): Promise<ProviderVoice[]> {
    try {
      const res = await this.client(secret).voices.search({ pageSize: 100, includeTotalCount: false });
      return res.voices.map((v) => ({
        id: v.voiceId,
        name: v.name ?? v.voiceId,
        description: v.description ?? null,
        category: v.category ?? null,
        previewUrl: v.previewUrl ?? null,
        labels: v.labels ?? undefined,
        languages: v.verifiedLanguages?.map((l) => l.language).filter((l): l is string => !!l),
      }));
    } catch (err) {
      throw mapError(err);
    }
  }

  async listModels(secret: string): Promise<ProviderModel[]> {
    try {
      const models = await this.client(secret).models.list();
      return models
        .filter((m) => m.canDoTextToSpeech !== false)
        .map((m) => ({
          id: m.modelId,
          name: m.name ?? m.modelId,
          description: m.description ?? null,
          maxCharacters: m.maximumTextLengthPerRequest ?? m.maxCharactersRequestSubscribedUser ?? null,
          supportsStyle: m.canUseStyle ?? false,
          supportsSpeakerBoost: m.canUseSpeakerBoost ?? false,
          languages: m.languages?.map((l) => l.languageId).filter((l): l is string => !!l),
        }));
    } catch (err) {
      throw mapError(err);
    }
  }

  async generateSpeech(input: { secret: string; text: string; voiceId: string; modelId: string; options?: Record<string, unknown> }) {
    const o = input.options ?? {};
    const num = (k: string) => (typeof o[k] === "number" ? (o[k] as number) : undefined);
    const bool = (k: string) => (typeof o[k] === "boolean" ? (o[k] as boolean) : undefined);
    try {
      const response = await this.client(input.secret).textToSpeech.convert(input.voiceId, {
        text: input.text,
        modelId: input.modelId,
        outputFormat: "mp3_44100_128",
        languageCode: typeof o.languageCode === "string" ? (o.languageCode as string) : undefined,
        voiceSettings: {
          stability: num("stability"),
          similarityBoost: num("similarityBoost"),
          style: num("style"),
          speed: num("speed"),
          useSpeakerBoost: bool("useSpeakerBoost"),
        },
      }).withRawResponse();
      const audio = await streamToBytes(response.data);
      const requestId = response.rawResponse.headers.get("request-id") ?? response.rawResponse.headers.get("x-request-id") ?? undefined;
      return { audio, mimeType: "audio/mpeg", providerRequestId: requestId };
    } catch (err) {
      throw mapError(err);
    }
  }
}

async function streamToBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/** Maps SDK errors to sanitized ProviderErrors; never leaks raw provider payloads or keys. */
export function mapError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof ElevenLabsError) {
    const status = err.statusCode;
    if (status === 401 || status === 403) return new ProviderError("INVALID_CREDENTIAL", "ElevenLabs rejected the API key. Check that it is valid and has text-to-speech permission.", false);
    if (status === 429) return new ProviderError("RATE_LIMITED", "ElevenLabs rate limit reached. Try again shortly.", true);
    if (status === 402) return new ProviderError("QUOTA_EXCEEDED", "ElevenLabs character quota exhausted for this billing period.", false);
    if (status === 400 || status === 422) return new ProviderError("INVALID_INPUT", `ElevenLabs rejected the request (${status}). Check the voice, model and text length.`, false);
    if (status && status >= 500) return new ProviderError("UNAVAILABLE", "ElevenLabs is temporarily unavailable.", true);
    return new ProviderError("UNKNOWN", `ElevenLabs request failed${status ? ` (${status})` : ""}.`, false);
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|network/i.test(message)) return new ProviderError("UNAVAILABLE", "Could not reach ElevenLabs.", true);
  return new ProviderError("UNKNOWN", "Provider request failed.", false);
}

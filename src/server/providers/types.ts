export type ProviderVoice = {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  previewUrl?: string | null;
  labels?: Record<string, string>;
  languages?: string[];
};

export type ProviderModel = {
  id: string;
  name: string;
  description?: string | null;
  maxCharacters?: number | null;
  supportsStyle?: boolean;
  supportsSpeakerBoost?: boolean;
  languages?: string[];
};

export type GenerationSettingField = {
  key: string;
  label: string;
  type: "number" | "boolean";
  min?: number;
  max?: number;
  step?: number;
  default: number | boolean;
  description?: string;
};

export type ProviderCapabilities = {
  settings: GenerationSettingField[];
  /** Whether a reliable per-character cost estimate can be computed. */
  costEstimateAvailable: boolean;
  outputMimeType: string;
};

export class ProviderError extends Error {
  constructor(
    public code: "INVALID_CREDENTIAL" | "RATE_LIMITED" | "INVALID_INPUT" | "QUOTA_EXCEEDED" | "UNAVAILABLE" | "UNKNOWN",
    message: string,
    public retryable: boolean,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface AIProviderAdapter {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  capabilities(): ProviderCapabilities;
  validateCredential(secret: string): Promise<{ ok: boolean; message?: string }>;
  listVoices(secret: string): Promise<ProviderVoice[]>;
  listModels(secret: string): Promise<ProviderModel[]>;
  generateSpeech(input: {
    secret: string;
    text: string;
    voiceId: string;
    modelId: string;
    options?: Record<string, unknown>;
  }): Promise<{ audio: Uint8Array; mimeType: string; providerRequestId?: string }>;
}

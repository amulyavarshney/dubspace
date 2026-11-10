import { z } from "zod";

const boolish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : ["1", "true", "yes", "on"].includes(v.toLowerCase())));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(16),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  /** Only for automated e2e runs; never enable in production. */
  AUTH_RATE_LIMIT_DISABLED: boolish.default(false),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  LOCAL_STORAGE_DIR: z.string().default(".data/storage"),
  LOCAL_STORAGE_SIGNING_SECRET: z.string().min(16).optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: boolish.default(true),

  INLINE_WORKER: boolish.default(true),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(250).default(2000),

  CREDENTIAL_ENCRYPTION_KEY: z.string().min(1),
  CREDENTIAL_ENCRYPTION_KEY_VERSION: z.string().default("v1"),
  CREDENTIAL_ENCRYPTION_KEY_PREVIOUS: z.string().optional(),
  CREDENTIAL_ENCRYPTION_KEY_PREVIOUS_VERSION: z.string().optional(),

  AI_MOCK_PROVIDER_ENABLED: boolish.default(false),
  AI_PROVIDER_ENV_FALLBACK_ENABLED: boolish.default(false),
  ELEVENLABS_API_KEY: z.string().optional(),

  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(200 * 1024 * 1024),
  MAX_AUDIO_DURATION_MS: z.coerce.number().int().positive().default(30 * 60 * 1000),

  EMAIL_TRANSPORT: z.enum(["console", "noop"]).default("console"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test helper: reset the cached env so overrides in process.env are picked up. */
export function resetEnvCache() {
  cached = null;
}

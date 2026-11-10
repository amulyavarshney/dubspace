import { randomUUID } from "node:crypto";
import { getEnv } from "@/server/env";
import { LocalStorageAdapter } from "./local";
import { S3StorageAdapter } from "./s3";
import type { StorageAdapter } from "./types";

export type { StorageAdapter, UploadTarget } from "./types";

const g = globalThis as unknown as { __storage?: StorageAdapter };

export function getStorage(): StorageAdapter {
  if (g.__storage) return g.__storage;
  const env = getEnv();
  g.__storage = env.STORAGE_DRIVER === "s3" ? new S3StorageAdapter() : new LocalStorageAdapter();
  return g.__storage;
}

/** Test helper. */
export function setStorageForTests(adapter: StorageAdapter | undefined) {
  g.__storage = adapter;
}

export const ALLOWED_AUDIO_MIME: Record<string, string> = {
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/vnd.wave": "wav",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "m4a",
};

export function extensionForMime(mime: string): string | null {
  return ALLOWED_AUDIO_MIME[mime.toLowerCase()] ?? null;
}

/** Server-generated opaque key; tenant and segment scoped for lifecycle management. */
export function buildRecordingKey(orgId: string, segmentId: string, ext: string): string {
  return `org/${orgId}/segments/${segmentId}/${randomUUID()}.${ext}`;
}

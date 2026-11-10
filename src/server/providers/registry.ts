import { getEnv } from "@/server/env";
import { ElevenLabsAdapter } from "./elevenlabs/adapter";
import { MockProviderAdapter } from "./mock/adapter";
import type { AIProviderAdapter } from "./types";

const g = globalThis as unknown as { __providers?: Map<string, AIProviderAdapter> };

function registry(): Map<string, AIProviderAdapter> {
  if (g.__providers) return g.__providers;
  const map = new Map<string, AIProviderAdapter>();
  const eleven = new ElevenLabsAdapter();
  map.set(eleven.id, eleven);
  if (getEnv().AI_MOCK_PROVIDER_ENABLED || getEnv().NODE_ENV === "test") {
    const mock = new MockProviderAdapter();
    map.set(mock.id, mock);
  }
  g.__providers = map;
  return map;
}

export function listProviderAdapters(): AIProviderAdapter[] {
  return Array.from(registry().values());
}

export function getProviderAdapter(id: string): AIProviderAdapter | null {
  return registry().get(id) ?? null;
}

/** Test helper to swap adapters. */
export function setProviderAdapterForTests(adapter: AIProviderAdapter) {
  registry().set(adapter.id, adapter);
}

"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ProviderSettingsCard } from "@/components/ai/provider-settings-card";
import { api } from "@/lib/api";
import type { ProviderConfigView } from "@/server/services/ai-providers";

export function ProviderSettings({ initial }: { initial: ProviderConfigView[] }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["ai-providers"], queryFn: async () => (await api.get<{ providers: ProviderConfigView[] }>("settings/ai-providers")).providers, initialData: initial });
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        <p>
          Provider API keys are encrypted at rest (AES-256-GCM) and only decrypted inside server-side generation jobs. <span className="font-medium text-foreground">The API key is encrypted and cannot be viewed after saving.</span> Only organization owners can change these settings; editors can generate drafts once a provider is enabled.
        </p>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {data.map((p) => (
          <ProviderSettingsCard key={p.providerId} provider={p} onChanged={() => qc.invalidateQueries({ queryKey: ["ai-providers"] })} />
        ))}
      </div>
    </div>
  );
}

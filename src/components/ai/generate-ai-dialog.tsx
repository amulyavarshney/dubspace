"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2Icon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api";
import type { ProviderCapabilities, ProviderModel, ProviderVoice } from "@/server/providers/types";

type Provider = { id: string; name: string; isDefault: boolean; capabilities: ProviderCapabilities };

export function GenerateAiDialog({ segmentId, script, locale, disabled, onQueued }: { segmentId: string; script: string; locale: string; disabled?: boolean; onQueued: (jobId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [providerId, setProviderId] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [modelId, setModelId] = useState("");
  const [text, setText] = useState(script);
  const [search, setSearch] = useState("");
  const [settings, setSettings] = useState<Record<string, number | boolean>>({});
  const [pending, setPending] = useState(false);

  const providersQuery = useQuery({ queryKey: ["ai-available-providers"], queryFn: async () => (await api.get<{ items: Provider[] }>("ai/providers")).items, enabled: open });
  const providers = providersQuery;
  const effectiveProviderId = providers.data?.some((p) => p.id === providerId) ? providerId : (providers.data?.[0]?.id ?? "");
  const provider = providers.data?.find((p) => p.id === effectiveProviderId) ?? null;

  const voices = useQuery({ queryKey: ["ai-voices", effectiveProviderId], queryFn: async () => (await api.get<{ items: ProviderVoice[] }>(`ai/providers/${effectiveProviderId}/voices`)).items, enabled: open && !!effectiveProviderId, staleTime: 5 * 60_000 });
  const models = useQuery({ queryKey: ["ai-models", effectiveProviderId], queryFn: async () => (await api.get<{ items: ProviderModel[] }>(`ai/providers/${effectiveProviderId}/models`)).items, enabled: open && !!effectiveProviderId, staleTime: 5 * 60_000 });

  const effectiveModelId = models.data?.some((m) => m.id === modelId) ? modelId : (models.data?.[0]?.id ?? "");
  const defaults = useMemo(() => Object.fromEntries((provider?.capabilities.settings ?? []).map((s) => [s.key, s.default])) as Record<string, number | boolean>, [provider]);
  const effectiveSettings = useMemo(() => ({ ...defaults, ...settings }), [defaults, settings]);

  const model = models.data?.find((m) => m.id === effectiveModelId) ?? null;
  const filteredVoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = voices.data ?? [];
    const lang = locale.split("-")[0];
    const sorted = [...list].sort((a, b) => Number(b.languages?.includes(lang) ?? false) - Number(a.languages?.includes(lang) ?? false));
    return q ? sorted.filter((v) => `${v.name} ${v.description ?? ""} ${Object.values(v.labels ?? {}).join(" ")}`.toLowerCase().includes(q)) : sorted;
  }, [voices.data, search, locale]);
  const selectedVoice = voices.data?.find((v) => v.id === voiceId) ?? null;
  const tooLong = model?.maxCharacters ? text.length > model.maxCharacters : text.length > 5000;

  async function submit() {
    setPending(true);
    try {
      const job = await api.post<{ id: string }>(`segments/${segmentId}/ai-generations`, { providerId: effectiveProviderId, voiceId, modelId: effectiveModelId, text: text.trim(), options: effectiveSettings });
      toast.success("AI draft queued. It will appear as a new version when ready.");
      setOpen(false);
      onQueued(job.id);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setText(script);
          setOpen(true);
        }}
        disabled={disabled}
      >
        <SparklesIcon className="size-4" /> Generate AI draft
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Generate an AI draft</DialogTitle>
            <DialogDescription>Creates a new recording version marked as AI generated. It goes through the same human review as any upload and is never auto-approved.</DialogDescription>
          </DialogHeader>
          {providers.isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" /> Checking configured providers…
            </div>
          ) : !providers.data?.length ? (
            <div className="rounded-xl bg-muted/60 p-4 text-sm">
              No AI provider is enabled for this organization. An owner can add an ElevenLabs API key under <span className="font-medium">Settings → AI providers</span>.
            </div>
          ) : (
            <div className="mt-2 grid gap-5 sm:grid-cols-2">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="provider">Provider</Label>
                  <NativeSelect
                    id="provider"
                    value={effectiveProviderId}
                    onChange={(e) => {
                      setProviderId(e.target.value);
                      setVoiceId("");
                      setSettings({});
                    }}
                  >
                    {providers.data.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.isDefault ? " (default)" : ""}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="model">Model</Label>
                  <NativeSelect id="model" value={effectiveModelId} onChange={(e) => setModelId(e.target.value)} disabled={models.isLoading}>
                    {(models.data ?? []).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </NativeSelect>
                  {models.isError && <p className="text-xs text-danger">{errorMessage(models.error)}</p>}
                  {model?.description && <p className="text-xs text-muted-foreground">{model.description}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="voice-search">Voice</Label>
                  <Input id="voice-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search voices…" />
                  <div className="max-h-44 overflow-y-auto rounded-lg border border-border" role="listbox" aria-label="Voices">
                    {voices.isLoading ? (
                      <p className="p-3 text-xs text-muted-foreground">Loading voices…</p>
                    ) : voices.isError ? (
                      <p className="p-3 text-xs text-danger">{errorMessage(voices.error)}</p>
                    ) : filteredVoices.length === 0 ? (
                      <p className="p-3 text-xs text-muted-foreground">No voices match.</p>
                    ) : (
                      filteredVoices.map((v) => (
                        <button key={v.id} type="button" role="option" aria-selected={voiceId === v.id} onClick={() => setVoiceId(v.id)} className={`flex w-full items-center justify-between gap-2 border-b border-border/60 px-3 py-2 text-left text-sm last:border-0 ${voiceId === v.id ? "bg-foreground text-background" : "hover:bg-muted"}`}>
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{v.name}</span>
                            <span className={`block truncate text-xs ${voiceId === v.id ? "text-background/70" : "text-muted-foreground"}`}>{v.description ?? Object.values(v.labels ?? {}).join(" · ") ?? v.category}</span>
                          </span>
                          {v.languages?.includes(locale.split("-")[0]) && <span className={`shrink-0 rounded px-1.5 text-[10px] font-semibold uppercase ${voiceId === v.id ? "bg-background/20" : "bg-muted"}`}>{locale}</span>}
                        </button>
                      ))
                    )}
                  </div>
                  {selectedVoice?.previewUrl && (
                    <audio controls src={selectedVoice.previewUrl} className="mt-1 h-8 w-full" aria-label={`Preview of ${selectedVoice.name}`} />
                  )}
                </div>
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="gen-text">Text</Label>
                  <Textarea id="gen-text" rows={6} value={text} onChange={(e) => setText(e.target.value)} />
                  <p className={`text-xs ${tooLong ? "text-danger" : "text-muted-foreground"}`}>
                    {text.length.toLocaleString()} characters{model?.maxCharacters ? ` · limit ${model.maxCharacters.toLocaleString()}` : ""} · language {locale}
                  </p>
                </div>
                {provider && provider.capabilities.settings.length > 0 && (
                  <fieldset className="space-y-3">
                    <legend className="text-sm font-medium">Settings</legend>
                    {provider.capabilities.settings
                      .filter((s) => !(s.key === "style" && model && !model.supportsStyle) && !(s.key === "useSpeakerBoost" && model && !model.supportsSpeakerBoost))
                      .map((s) =>
                        s.type === "boolean" ? (
                          <label key={s.key} className="flex items-center justify-between gap-3 text-sm">
                            <span>{s.label}</span>
                            <input type="checkbox" className="accent-foreground" checked={Boolean(effectiveSettings[s.key])} onChange={(e) => setSettings({ ...effectiveSettings, [s.key]: e.target.checked })} />
                          </label>
                        ) : (
                          <div key={s.key} className="text-sm">
                            <div className="flex items-center justify-between">
                              <label htmlFor={`s-${s.key}`}>{s.label}</label>
                              <span className="font-mono text-xs tabular-nums text-muted-foreground">{Number(effectiveSettings[s.key] ?? s.default).toFixed(2)}</span>
                            </div>
                            <input id={`s-${s.key}`} type="range" min={s.min} max={s.max} step={s.step} value={Number(effectiveSettings[s.key] ?? s.default)} onChange={(e) => setSettings({ ...effectiveSettings, [s.key]: Number(e.target.value) })} className="mt-1 w-full accent-foreground" />
                            {s.description && <p className="text-[11px] text-muted-foreground">{s.description}</p>}
                          </div>
                        ),
                      )}
                  </fieldset>
                )}
                <p className="text-xs text-muted-foreground">{provider?.capabilities.costEstimateAvailable ? `Estimated usage: ${text.length.toLocaleString()} characters.` : "Cost estimate unavailable for this provider; usage is tracked against the organization's budget after generation."}</p>
              </div>
            </div>
          )}
          <DialogFooter className="mt-6">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending || !effectiveProviderId || !voiceId || !effectiveModelId || !text.trim() || tooLong}>
              {pending && <Loader2Icon className="size-4 animate-spin" />} Generate draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import { useState } from "react";
import { CheckCircle2Icon, KeyRoundIcon, Loader2Icon, PlugZapIcon, ShieldCheckIcon, Trash2Icon, XCircleIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SecretInput } from "@/components/ai/secret-input";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ProviderConfigView } from "@/server/services/ai-providers";

export function ProviderSettingsCard({ provider, onChanged }: { provider: ProviderConfigView; onChanged: () => void }) {
  const [key, setKey] = useState("");
  const [quota, setQuota] = useState(provider.monthlyCharacterQuota?.toString() ?? "");
  const [pending, setPending] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function run(label: string, fn: () => Promise<unknown>, success?: string) {
    setPending(label);
    try {
      await fn();
      if (success) toast.success(success);
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPending(null);
    }
  }

  const saveKey = () => run("save", () => api.put(`settings/ai-providers/${provider.providerId}`, { apiKey: key.trim(), enabled: true }), provider.configured ? "API key replaced" : "Provider configured").then(() => setKey(""));
  const toggleEnabled = (enabled: boolean) => run("toggle", () => api.put(`settings/ai-providers/${provider.providerId}`, { enabled }), enabled ? "Provider enabled" : "Provider disabled");
  const setDefault = () => run("default", () => api.put(`settings/ai-providers/${provider.providerId}`, { isDefault: true }), "Default provider updated");
  const saveQuota = () => run("quota", () => api.put(`settings/ai-providers/${provider.providerId}`, { monthlyCharacterQuota: quota ? Number(quota) : null }), "Budget updated");
  const test = () =>
    run("test", async () => {
      const res = await api.post<{ ok: boolean; message: string }>(`settings/ai-providers/${provider.providerId}/test`);
      setTestResult(res);
    });
  const revoke = () => {
    if (!confirm(`Remove the stored ${provider.name} API key? Generation will stop working until a new key is saved.`)) return;
    run("delete", () => api.delete(`settings/ai-providers/${provider.providerId}`), "API key removed");
  };

  const usagePct = provider.monthlyCharacterQuota ? Math.min(100, (provider.usage.characters / provider.monthlyCharacterQuota) * 100) : null;

  return (
    <section className="flex flex-col rounded-2xl border border-border bg-card">
      <div className="flex items-start justify-between gap-3 border-b border-border p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
            <PlugZapIcon className="size-5" />
          </div>
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              {provider.name}
              {provider.isDefault && <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold tracking-wide text-background uppercase">Default</span>}
            </h2>
            <p className="text-sm text-muted-foreground">{provider.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`enabled-${provider.providerId}`} className="text-xs text-muted-foreground">
            {provider.enabled ? "Enabled" : "Disabled"}
          </Label>
          <Switch id={`enabled-${provider.providerId}`} checked={provider.enabled} disabled={!provider.configured || provider.environmentFallback || pending === "toggle"} onCheckedChange={toggleEnabled} />
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <KeyRoundIcon className="size-4 text-muted-foreground" />
            {provider.environmentFallback ? <span>Using server environment key (local development fallback)</span> : provider.configured ? <span className="font-mono">{provider.maskedKey}</span> : <span className="text-muted-foreground">No API key saved</span>}
          </span>
          {provider.configured && !provider.environmentFallback && (
            <span className={cn("inline-flex items-center gap-1 text-xs", provider.lastTestStatus === "SUCCESS" ? "text-success" : provider.lastTestStatus === "FAILED" ? "text-danger" : "text-muted-foreground")}>
              {provider.lastTestStatus === "SUCCESS" ? <CheckCircle2Icon className="size-3.5" /> : provider.lastTestStatus === "FAILED" ? <XCircleIcon className="size-3.5" /> : <ShieldCheckIcon className="size-3.5" />}
              {provider.lastTestStatus === "NEVER" ? "Not tested yet" : `Last test ${provider.lastTestStatus.toLowerCase()} · ${formatDateTime(provider.lastTestedAt)}`}
            </span>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`key-${provider.providerId}`}>{provider.configured ? "Replace API key" : "API key"}</Label>
          <div className="flex gap-2">
            <SecretInput id={`key-${provider.providerId}`} value={key} onChange={setKey} placeholder={provider.providerId === "mock" ? "mock-anything" : "Paste a key with text-to-speech permission"} disabled={!!pending} />
            <Button onClick={saveKey} disabled={key.trim().length < 8 || pending === "save"}>
              {pending === "save" && <Loader2Icon className="size-4 animate-spin" />} {provider.configured ? "Replace" : "Save"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Sent once over HTTPS to the server, encrypted with the current key version and never shown again. Use a least-privilege key where the provider supports it.</p>
        </div>

        {provider.configured && (
          <>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={test} disabled={!!pending || !provider.enabled}>
                {pending === "test" ? <Loader2Icon className="size-4 animate-spin" /> : <PlugZapIcon className="size-4" />} Test connection
              </Button>
              {!provider.isDefault && provider.enabled && (
                <Button variant="outline" onClick={setDefault} disabled={!!pending}>
                  Make default
                </Button>
              )}
              {!provider.environmentFallback && (
                <Button variant="destructive" onClick={revoke} disabled={!!pending}>
                  <Trash2Icon className="size-4" /> Remove key
                </Button>
              )}
            </div>
            {(testResult || provider.lastTestMessage) && (
              <div role="status" className={cn("rounded-lg px-3 py-2 text-sm", (testResult?.ok ?? provider.lastTestStatus === "SUCCESS") ? "bg-success-soft/60 text-success" : "bg-danger-soft/60 text-danger")}>
                {testResult?.message ?? provider.lastTestMessage}
              </div>
            )}

            <div className="space-y-2 border-t border-border pt-5">
              <Label htmlFor={`quota-${provider.providerId}`}>Monthly character budget</Label>
              <div className="flex gap-2">
                <Input id={`quota-${provider.providerId}`} type="number" min={1000} step={1000} value={quota} onChange={(e) => setQuota(e.target.value)} placeholder="No limit" className="max-w-[200px]" />
                <Button variant="outline" onClick={saveQuota} disabled={pending === "quota"}>
                  Save
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                {provider.usage.characters.toLocaleString()} characters · {provider.usage.requests} requests this period ({provider.usage.period})
                {provider.monthlyCharacterQuota ? ` · ${Math.round(usagePct ?? 0)}% of budget` : ""}
              </div>
              {usagePct !== null && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(usagePct)} aria-valuemin={0} aria-valuemax={100} aria-label="Budget used">
                  <div className={cn("h-full rounded-full", usagePct > 90 ? "bg-danger" : "bg-foreground")} style={{ width: `${usagePct}%` }} />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

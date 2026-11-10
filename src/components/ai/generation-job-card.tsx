"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2Icon, SparklesIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

type Job = { id: string; status: string; providerId: string; modelId: string; voiceName: string | null; voiceId: string; errorMessage: string | null; errorCode: string | null; attemptCount: number; characterCount: number; createdAt: string; outputRecording: { id: string; versionNumber: number; processingStatus: string } | null };

export function GenerationJobList({ segmentId, onChanged }: { segmentId: string; onChanged: () => void }) {
  const { data, refetch } = useQuery({
    queryKey: ["generation-jobs", segmentId],
    queryFn: async () => (await api.get<{ items: Job[] }>(`segments/${segmentId}/ai-generations`)).items,
    refetchInterval: (q) => (q.state.data?.some((j) => j.status === "QUEUED" || j.status === "RUNNING") ? 2500 : 30_000),
  });
  const jobs = data ?? [];
  if (!jobs.length) return null;

  async function cancel(id: string) {
    try {
      await api.post(`ai-generations/${id}/cancel`);
      refetch();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  async function retry(id: string) {
    try {
      await api.post(`ai-generations/${id}/retry`);
      refetch();
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <section className="rounded-2xl border border-border p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <SparklesIcon className="size-4" /> AI generation history
      </h3>
      <ul className="space-y-2">
        {jobs.map((j) => {
          const active = j.status === "QUEUED" || j.status === "RUNNING";
          return (
            <li key={j.id} className="flex items-start justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-1.5">
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", j.status === "SUCCEEDED" ? "bg-success-soft text-success" : j.status === "FAILED" ? "bg-danger-soft text-danger" : j.status === "CANCELLED" ? "bg-muted text-muted-foreground" : "bg-info-soft text-info")}>{active && <Loader2Icon className="mr-1 inline size-3 animate-spin" />}{j.status.toLowerCase()}</span>
                  <span className="font-medium">{j.voiceName ?? j.voiceId}</span>
                  <span className="text-xs text-muted-foreground">
                    {j.providerId} · {j.modelId} · {j.characterCount} chars
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatRelative(j.createdAt)}
                  {j.outputRecording ? ` · produced v${j.outputRecording.versionNumber}` : ""}
                  {j.errorMessage && j.status !== "SUCCEEDED" ? ` · ${j.errorMessage}` : ""}
                  {j.attemptCount > 1 ? ` · attempt ${j.attemptCount}` : ""}
                </p>
              </div>
              {active ? (
                <Button size="xs" variant="ghost" onClick={() => cancel(j.id)} aria-label="Cancel generation">
                  <XIcon className="size-3" /> Cancel
                </Button>
              ) : j.status === "FAILED" || j.status === "CANCELLED" ? (
                <Button size="xs" variant="outline" onClick={() => retry(j.id)}>
                  Retry
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

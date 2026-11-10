"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api";
import { displayLanguageName, normalizeLocale } from "@/lib/locale";

export function AddSegmentDialog({ projectId, videos }: { projectId: string; videos: Array<{ id: string; title: string; locales: string[] }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [videoId, setVideoId] = useState(videos[0]?.id ?? "");
  const [locale, setLocale] = useState(videos[0]?.locales[0] ?? "");
  const [externalId, setExternalId] = useState("");
  const [start, setStart] = useState("0");
  const [end, setEnd] = useState("5");
  const [script, setScript] = useState("");
  const [pending, setPending] = useState(false);
  const video = videos.find((v) => v.id === videoId);
  const localeOptions = Array.from(new Set([...(video?.locales ?? []), ...videos.flatMap((v) => v.locales)]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const norm = normalizeLocale(locale);
    if (!norm) return toast.error("Enter a valid language tag, e.g. es or pt-BR");
    setPending(true);
    try {
      const seg = await api.post<{ id: string }>(`projects/${projectId}/segments`, {
        videoId,
        locale: norm,
        startMs: Math.round(Number(start) * 1000),
        endMs: Math.round(Number(end) * 1000),
        script: script.trim(),
        externalId: externalId.trim() || undefined,
      });
      toast.success("Segment added");
      setOpen(false);
      router.push(`/projects/${projectId}/segments/${seg.id}`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={videos.length === 0} title={videos.length === 0 ? "Add a video first (import a spreadsheet)" : undefined}>
        <PlusIcon className="size-4" /> Add segment
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>Add segment</DialogTitle>
              <DialogDescription>Create a single line to record. For many segments, import a spreadsheet instead.</DialogDescription>
            </DialogHeader>
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="video">Video</Label>
                  <NativeSelect id="video" value={videoId} onChange={(e) => setVideoId(e.target.value)}>
                    {videos.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.title}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="locale">Language</Label>
                  <Input id="locale" list="locale-options" value={locale} onChange={(e) => setLocale(e.target.value)} placeholder="es" required />
                  <datalist id="locale-options">
                    {localeOptions.map((l) => (
                      <option key={l} value={l}>
                        {displayLanguageName(l)}
                      </option>
                    ))}
                  </datalist>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ext">Segment id</Label>
                  <Input id="ext" value={externalId} onChange={(e) => setExternalId(e.target.value)} placeholder="L0042" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="start">Start (s)</Label>
                  <Input id="start" type="number" min={0} step="0.1" value={start} onChange={(e) => setStart(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="end">End (s)</Label>
                  <Input id="end" type="number" min={0} step="0.1" value={end} onChange={(e) => setEnd(e.target.value)} required />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="script">Script</Label>
                <Textarea id="script" rows={3} value={script} onChange={(e) => setScript(e.target.value)} required placeholder="The line the actor should record" />
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !script.trim() || !videoId}>
                {pending && <Loader2Icon className="size-4 animate-spin" />} Add segment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2Icon, PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api";
import { displayLanguageName, normalizeLocale } from "@/lib/locale";

const SUGGESTED = ["es", "fr", "de", "it", "pt-BR", "ja", "ko", "zh", "hi", "ar"];

export function NewProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [sourceLocale, setSourceLocale] = useState("en");
  const [videos, setVideos] = useState<Array<{ title: string; referenceUrl: string }>>([{ title: "", referenceUrl: "" }]);
  const [locales, setLocales] = useState<string[]>([]);
  const [localeInput, setLocaleInput] = useState("");
  const [pending, setPending] = useState(false);

  function addLocale(raw: string) {
    const norm = normalizeLocale(raw);
    if (!norm) {
      toast.error(`"${raw}" is not a recognised language. Use a BCP 47 tag like es or pt-BR.`);
      return;
    }
    if (!locales.includes(norm)) setLocales([...locales, norm]);
    setLocaleInput("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const project = await api.post<{ id: string }>("projects", {
        name: name.trim(),
        description: description.trim() || undefined,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        sourceLocale,
        videos: videos.filter((v) => v.title.trim()).map((v) => ({ title: v.title.trim(), referenceUrl: v.referenceUrl.trim() || "" })),
        targetLocales: locales,
      });
      toast.success("Project created");
      router.push(`/projects/${project.id}`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-8">
      <section className="space-y-4 rounded-2xl border border-border p-5">
        <h2 className="text-sm font-semibold">Basics</h2>
        <div className="space-y-1.5">
          <Label htmlFor="name">Project name</Label>
          <Input id="name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="Documentary S1 — localization" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Delivery notes, tone guidance, client requirements…" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="deadline">Target deadline</Label>
            <Input id="deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="source">Source language</Label>
            <Input id="source" value={sourceLocale} onChange={(e) => setSourceLocale(e.target.value)} placeholder="en" />
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-border p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Videos</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => setVideos([...videos, { title: "", referenceUrl: "" }])}>
            <PlusIcon className="size-3.5" /> Add video
          </Button>
        </div>
        <div className="space-y-3">
          {videos.map((v, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Input aria-label={`Video ${i + 1} title`} value={v.title} onChange={(e) => setVideos(videos.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder={`Episode ${i + 1}`} />
              <Input aria-label={`Video ${i + 1} reference link`} value={v.referenceUrl} onChange={(e) => setVideos(videos.map((x, j) => (j === i ? { ...x, referenceUrl: e.target.value } : x)))} placeholder="Reference video link (optional)" />
              <Button type="button" variant="ghost" size="icon" aria-label="Remove video" onClick={() => setVideos(videos.filter((_, j) => j !== i))} disabled={videos.length === 1}>
                <XIcon className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-border p-5">
        <h2 className="text-sm font-semibold">Target languages</h2>
        <div className="flex flex-wrap gap-2">
          {locales.map((l) => (
            <span key={l} className="inline-flex items-center gap-1 rounded-full bg-muted py-1 pr-1 pl-3 text-sm">
              {displayLanguageName(l)} <span className="text-xs text-muted-foreground">{l}</span>
              <button type="button" aria-label={`Remove ${l}`} onClick={() => setLocales(locales.filter((x) => x !== l))} className="rounded-full p-1 hover:bg-background">
                <XIcon className="size-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            aria-label="Add language"
            value={localeInput}
            onChange={(e) => setLocaleInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && localeInput.trim()) {
                e.preventDefault();
                addLocale(localeInput.trim());
              }
            }}
            placeholder="Type a language (e.g. Spanish or es-MX) and press Enter"
          />
          <Button type="button" variant="outline" onClick={() => localeInput.trim() && addLocale(localeInput.trim())}>
            Add
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED.filter((s) => !locales.includes(s)).map((s) => (
            <button key={s} type="button" onClick={() => addLocale(s)} className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-foreground/40 hover:text-foreground">
              + {displayLanguageName(s)}
            </button>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || name.trim().length < 2}>
          {pending && <Loader2Icon className="size-4 animate-spin" />} Create project
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

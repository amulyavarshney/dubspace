"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { AlertTriangleIcon, CheckCircle2Icon, FileSpreadsheetIcon, Loader2Icon, UploadIcon, XCircleIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ApiClientError, api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ColumnMapping, CommitResult, ImportPreview } from "@/server/services/imports";

const FIELDS: Array<{ key: keyof ColumnMapping; label: string; required?: boolean; help: string }> = [
  { key: "video", label: "Video", required: true, help: "Episode / clip name" },
  { key: "language", label: "Language", required: true, help: "Target language (BCP 47 or name)" },
  { key: "segment_external_id", label: "Segment id", help: "Stable id used to update rows later" },
  { key: "start_ms", label: "Start", help: "ms, seconds or mm:ss" },
  { key: "end_ms", label: "End", help: "ms, seconds or mm:ss" },
  { key: "script", label: "Script", required: true, help: "Line to record" },
  { key: "actor_email", label: "Actor email", help: "Assigns if the actor is an org member" },
  { key: "due_date", label: "Due date", help: "Any parseable date" },
  { key: "notes", label: "Notes", help: "Direction for the actor" },
  { key: "required", label: "Required", help: "yes/no — counts toward progress" },
];

type Step = "upload" | "map" | "preview" | "done";

export function ImportWizard({ projectId }: { projectId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<Step>("upload");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [sheet, setSheet] = useState<string>("");
  const [pending, setPending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [showOnlyInvalid, setShowOnlyInvalid] = useState(false);

  const runPreview = useCallback(
    async (f: File, m?: ColumnMapping, s?: string) => {
      setPending(true);
      try {
        const fd = new FormData();
        fd.append("file", f);
        if (m && Object.keys(m).length) fd.append("mapping", JSON.stringify(m));
        if (s) fd.append("sheet", s);
        const res = await fetch(`/api/v1/projects/${projectId}/imports/preview`, { method: "POST", body: fd });
        const json = await res.json();
        if (!res.ok) throw new ApiClientError(res.status, json.code, json.message, json.requestId, json.details);
        const p = json as ImportPreview;
        setPreview(p);
        setMapping(p.mapping);
        setSheet(p.sheet);
        setStep(m ? "preview" : "map");
      } catch (err) {
        toast.error(errorMessage(err));
      } finally {
        setPending(false);
      }
    },
    [projectId],
  );

  function onFile(f: File | undefined) {
    if (!f) return;
    if (!/\.(xlsx|xlsm|csv|txt)$/i.test(f.name)) return toast.error("Upload an .xlsx or .csv file");
    setFile(f);
    setResult(null);
    void runPreview(f);
  }

  async function commit(mode: "all" | "valid_only") {
    if (!preview) return;
    setPending(true);
    try {
      const res = await api.post<CommitResult>(`projects/${projectId}/imports/commit`, { batchId: preview.batchId, mode });
      setResult(res);
      setStep("done");
      toast.success(`Imported ${res.imported + res.updated} segments`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  const steps: Array<{ id: Step; label: string }> = [
    { id: "upload", label: "Upload" },
    { id: "map", label: "Map columns" },
    { id: "preview", label: "Validate" },
    { id: "done", label: "Import" },
  ];
  const stepIndex = steps.findIndex((s) => s.id === step);

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap items-center gap-2 text-sm">
        {steps.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2">
            <span className={cn("flex size-6 items-center justify-center rounded-full text-xs font-semibold", i <= stepIndex ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>{i + 1}</span>
            <span className={i <= stepIndex ? "font-medium" : "text-muted-foreground"}>{s.label}</span>
            {i < steps.length - 1 && <span className="mx-1 h-px w-6 bg-border" aria-hidden />}
          </li>
        ))}
      </ol>

      {step === "upload" && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            onFile(e.dataTransfer.files[0]);
          }}
          className={cn("flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-colors", dragging ? "border-foreground bg-muted/60" : "border-border")}
        >
          <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
            {pending ? <Loader2Icon className="size-5 animate-spin" /> : <FileSpreadsheetIcon className="size-5" />}
          </div>
          <h2 className="text-base font-semibold">Drop your spreadsheet here</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            .xlsx or .csv with one row per segment. Suggested columns: <code className="rounded bg-muted px-1 text-xs">video, language, segment_external_id, start_ms, end_ms, script, actor_email, due_date, notes</code>
          </p>
          <input ref={inputRef} type="file" accept=".xlsx,.xlsm,.csv,.txt" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          <Button className="mt-6" onClick={() => inputRef.current?.click()} disabled={pending}>
            <UploadIcon className="size-4" /> Choose file
          </Button>
          <a href="/samples/dubbing-import-sample.csv" download className="mt-3 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
            Download a sample CSV
          </a>
        </div>
      )}

      {step === "map" && preview && file && (
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <section className="space-y-4 rounded-2xl border border-border p-5">
            <div>
              <h2 className="text-sm font-semibold">{file.name}</h2>
              <p className="text-xs text-muted-foreground">
                {preview.summary.total} rows · {preview.headers.length} columns
              </p>
            </div>
            {preview.sheets.length > 1 && (
              <div className="space-y-1.5">
                <Label htmlFor="sheet">Sheet</Label>
                <NativeSelect
                  id="sheet"
                  value={sheet}
                  onChange={(e) => {
                    setSheet(e.target.value);
                    void runPreview(file, undefined, e.target.value);
                  }}
                >
                  {preview.sheets.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name} ({s.rowCount} rows)
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
            <div className="space-y-3">
              {FIELDS.map((f) => (
                <div key={f.key} className="grid grid-cols-[120px_1fr] items-center gap-2">
                  <Label htmlFor={`map-${f.key}`} className="text-xs">
                    {f.label}
                    {f.required && <span className="text-danger"> *</span>}
                  </Label>
                  <NativeSelect id={`map-${f.key}`} value={mapping[f.key] ?? ""} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || undefined })} title={f.help}>
                    <option value="">— not mapped —</option>
                    {preview.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={() => runPreview(file, mapping, sheet)} disabled={pending || !mapping.video || !mapping.language || !mapping.script}>
                {pending && <Loader2Icon className="size-4 animate-spin" />} Validate rows
              </Button>
              <Button variant="ghost" onClick={() => setStep("upload")}>
                Back
              </Button>
            </div>
          </section>
          <section className="min-w-0 rounded-2xl border border-border">
            <div className="border-b border-border px-4 py-2.5 text-sm font-semibold">Preview (first 10 rows)</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    {preview.headers.map((h) => (
                      <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">
                        {h}
                        {Object.entries(mapping).find(([, v]) => v === h) && <span className="ml-1 rounded bg-foreground px-1 text-[10px] text-background">{FIELDS.find((f) => mapping[f.key] === h)?.label}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 10).map((r) => (
                    <tr key={r.rowNumber} className="border-b border-border/70 last:border-0">
                      {preview.headers.map((h) => (
                        <td key={h} className="max-w-[240px] truncate px-3 py-2">
                          {rawCell(r, h, mapping)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {step === "preview" && preview && file && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Rows" value={preview.summary.total} />
            <Stat label="Valid" value={preview.summary.valid} tone="success" />
            <Stat label="Rejected" value={preview.summary.invalid} tone={preview.summary.invalid ? "danger" : "neutral"} />
            <Stat label="Warnings" value={preview.summary.warnings} tone={preview.summary.warnings ? "warning" : "neutral"} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-foreground" checked={showOnlyInvalid} onChange={(e) => setShowOnlyInvalid(e.target.checked)} /> Show only rows with problems
            </label>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setStep("map")}>
                Back to mapping
              </Button>
              {preview.summary.invalid > 0 && (
                <Button variant="outline" onClick={() => commit("valid_only")} disabled={pending || preview.summary.valid === 0}>
                  Import {preview.summary.valid} valid rows only
                </Button>
              )}
              <Button onClick={() => commit("all")} disabled={pending || preview.summary.invalid > 0 || preview.summary.valid === 0} title={preview.summary.invalid > 0 ? "Fix the rejected rows or import valid rows only" : undefined}>
                {pending && <Loader2Icon className="size-4 animate-spin" />} Import all rows
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Row</th>
                  <th className="px-3 py-2 font-medium">Video</th>
                  <th className="px-3 py-2 font-medium">Language</th>
                  <th className="px-3 py-2 font-medium">Id</th>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Script</th>
                  <th className="px-3 py-2 font-medium">Actor</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows
                  .filter((r) => !showOnlyInvalid || r.errors.length || r.warnings.length)
                  .map((r) => (
                    <tr key={r.rowNumber} className={cn("border-b border-border/70 last:border-0", r.errors.length && "bg-danger-soft/30")}>
                      <td className="px-3 py-2 tabular-nums">{r.rowNumber}</td>
                      <td className="max-w-[140px] truncate px-3 py-2">{r.video}</td>
                      <td className="px-3 py-2">{r.locale ?? <span className="text-danger">{r.languageLabel}</span>}</td>
                      <td className="px-3 py-2">{r.externalId ?? "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                        {(r.startMs ?? 0) / 1000}s → {(r.endMs ?? 0) / 1000}s
                      </td>
                      <td className="max-w-[260px] truncate px-3 py-2">{r.script}</td>
                      <td className="px-3 py-2">{r.actorEmail ?? "—"}</td>
                      <td className="px-3 py-2">
                        {r.errors.length ? (
                          <span className="flex items-start gap-1 text-danger">
                            <XCircleIcon className="mt-0.5 size-3 shrink-0" /> {r.errors.join("; ")}
                          </span>
                        ) : r.warnings.length ? (
                          <span className="flex items-start gap-1 text-warning">
                            <AlertTriangleIcon className="mt-0.5 size-3 shrink-0" /> {r.warnings.join("; ")}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-success">
                            <CheckCircle2Icon className="size-3" /> OK
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === "done" && result && (
        <div className="rounded-2xl border border-border p-6">
          <div className="flex items-center gap-3">
            <CheckCircle2Icon className="size-6 text-success" />
            <div>
              <h2 className="text-base font-semibold">Import complete</h2>
              <p className="text-sm text-muted-foreground">
                {result.imported} created · {result.updated} updated · {result.assigned} assigned · {result.skipped} skipped · {result.rejected} rejected
              </p>
            </div>
          </div>
          {result.messages.length > 0 && (
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {result.messages.slice(0, 20).map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          )}
          <div className="mt-6 flex gap-2">
            <Button render={<Link href={`/projects/${projectId}`} />}>Go to project</Button>
            <Button
              variant="outline"
              onClick={() => {
                setStep("upload");
                setFile(null);
                setPreview(null);
              }}
            >
              Import another file
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function rawCell(row: ImportPreview["rows"][number], header: string, mapping: ColumnMapping): string {
  const field = (Object.keys(mapping) as Array<keyof ColumnMapping>).find((k) => mapping[k] === header);
  if (!field) return "";
  switch (field) {
    case "video":
      return row.video;
    case "language":
      return row.languageLabel;
    case "segment_external_id":
      return row.externalId ?? "";
    case "start_ms":
      return row.startMs?.toString() ?? "";
    case "end_ms":
      return row.endMs?.toString() ?? "";
    case "script":
      return row.script;
    case "actor_email":
      return row.actorEmail ?? "";
    case "due_date":
      return row.dueAt ?? "";
    case "notes":
      return row.notes ?? "";
    case "required":
      return row.required ? "yes" : "no";
  }
}

function Stat({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "success" | "warning" | "danger" }) {
  const cls = { neutral: "", success: "text-success", warning: "text-warning", danger: "text-danger" }[tone];
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-2xl font-semibold tabular-nums", cls)}>{value}</p>
    </div>
  );
}

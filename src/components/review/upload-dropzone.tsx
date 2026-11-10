"use client";

import { useRef, useState } from "react";
import { CheckCircle2Icon, Loader2Icon, UploadCloudIcon, XCircleIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

type Phase = "idle" | "uploading" | "processing" | "submitted" | "failed";

const ACCEPT = ".wav,.mp3,.m4a,audio/wav,audio/x-wav,audio/mpeg,audio/mp4,audio/x-m4a";

function guessMime(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext === "wav" ? "audio/wav" : ext === "mp3" ? "audio/mpeg" : ext === "m4a" ? "audio/mp4" : "application/octet-stream";
}

export function UploadDropzone({ segmentId, disabled, disabledReason, onUploaded, compact }: { segmentId: string; disabled?: boolean; disabledReason?: string; onUploaded: (recordingId: string) => void; compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function upload(file: File) {
    setError(null);
    setFileName(file.name);
    setPhase("uploading");
    setProgress(0);
    try {
      const mimeType = guessMime(file);
      const idempotencyKey = `${segmentId}:${file.name}:${file.size}:${file.lastModified}`;
      const intent = await api.post<{ recordingVersionId: string; versionNumber: number; upload: { url: string; method: string; headers: Record<string, string> } }>(`segments/${segmentId}/recordings/upload-intent`, { filename: file.name, mimeType, sizeBytes: file.size, idempotencyKey });
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(intent.upload.method, intent.upload.url);
        for (const [k, v] of Object.entries(intent.upload.headers)) xhr.setRequestHeader(k, v);
        xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Storage rejected the upload (${xhr.status})`)));
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(file);
      });
      setPhase("processing");
      await api.post(`recordings/${intent.recordingVersionId}/complete`);
      // Poll processing status.
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const s = await api.get<{ processingStatus: string; processingError: string | null }>(`recordings/${intent.recordingVersionId}`);
        if (s.processingStatus === "READY") {
          setPhase("submitted");
          toast.success(`Version ${intent.versionNumber} submitted for review`);
          onUploaded(intent.recordingVersionId);
          return;
        }
        if (s.processingStatus === "FAILED") throw new Error(s.processingError ?? "Processing failed");
      }
      throw new Error("Processing is taking longer than expected. Refresh to check its status.");
    } catch (e) {
      setPhase("failed");
      setError(errorMessage(e));
    }
  }

  const label: Record<Phase, string> = { idle: "", uploading: `Uploading ${progress}%`, processing: "Processing audio…", submitted: "Submitted", failed: "Failed" };

  return (
    <div
      className={cn("rounded-2xl border-2 border-dashed p-4 text-center transition-colors", dragging && !disabled ? "border-foreground bg-muted/60" : "border-border", disabled && "opacity-60")}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (disabled) return;
        const f = e.dataTransfer.files[0];
        if (f) void upload(f);
      }}
    >
      <input ref={inputRef} type="file" accept={ACCEPT} className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} disabled={disabled} />
      {phase === "idle" || phase === "submitted" || phase === "failed" ? (
        <div className={cn("flex items-center justify-center gap-3", compact ? "flex-row" : "flex-col py-2")}>
          {phase === "submitted" ? <CheckCircle2Icon className="size-5 text-success" /> : phase === "failed" ? <XCircleIcon className="size-5 text-danger" /> : <UploadCloudIcon className="size-5 text-muted-foreground" />}
          <div className={compact ? "text-left" : ""}>
            <p className="text-sm font-medium">{phase === "submitted" ? `${fileName} submitted` : phase === "failed" ? "Upload failed" : "Upload a new recording"}</p>
            <p className="text-xs text-muted-foreground">{phase === "failed" ? error : disabled ? disabledReason : "WAV, MP3 or M4A · drag and drop or choose a file"}</p>
          </div>
          <Button variant={phase === "idle" ? "default" : "outline"} size="sm" onClick={() => inputRef.current?.click()} disabled={disabled}>
            {phase === "failed" ? "Try again" : phase === "submitted" ? "Upload another" : "Choose file"}
          </Button>
        </div>
      ) : (
        <div className="py-2" role="status" aria-live="polite">
          <div className="flex items-center justify-center gap-2 text-sm font-medium">
            <Loader2Icon className="size-4 animate-spin" /> {label[phase]}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{fileName}</p>
          <div className="mx-auto mt-3 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-foreground transition-[width]" style={{ width: phase === "processing" ? "100%" : `${progress}%` }} />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">{phase === "processing" ? "Validating the file and generating the waveform." : formatBytes(undefined)}</p>
        </div>
      )}
    </div>
  );
}

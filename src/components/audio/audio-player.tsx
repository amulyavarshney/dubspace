"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { PauseIcon, PlayIcon, RotateCcwIcon, RotateCwIcon, Volume2Icon, VolumeXIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WaveformTimeline, type Marker } from "@/components/audio/waveform-timeline";
import { useAudioPlayer } from "@/hooks/use-audio-player";
import { api } from "@/lib/api";
import { formatMs } from "@/lib/format";
import { cn } from "@/lib/utils";

const RATES = [0.75, 1, 1.25, 1.5];

export type AudioPlayerHandle = ReturnType<typeof useAudioPlayer>;

export function AudioPlayer({ recordingId, peaks, durationMs, markers, onMarkerClick, onTimeChange, player, disabled, className }: { recordingId: string | null; peaks: number[] | null; durationMs: number | null; markers?: Marker[]; onMarkerClick?: (m: Marker) => void; onTimeChange?: (ms: number) => void; player: AudioPlayerHandle; disabled?: boolean; className?: string }) {
  const { data: playback, isError } = useQuery({
    queryKey: ["playback-url", recordingId],
    queryFn: () => api.get<{ url: string; expiresAt: string; mimeType: string }>(`recordings/${recordingId}/playback-url`),
    enabled: !!recordingId && !disabled,
    staleTime: 8 * 60_000,
    refetchInterval: 8 * 60_000,
  });
  const { state, toggle, seek, skip, setRate, setVolume, setSrc } = player;
  const src = playback?.url ?? null;

  useEffect(() => {
    setSrc(src, recordingId);
  }, [src, recordingId, setSrc]);

  useEffect(() => {
    onTimeChange?.(state.currentMs);
  }, [state.currentMs, onTimeChange]);

  // Keyboard shortcuts when focus is not in a text field.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable || target.tagName === "SELECT")) return;
      if (e.key === " " || e.key === "k") {
        e.preventDefault();
        toggle();
      } else if (e.key === "ArrowLeft" || e.key === "j") {
        e.preventDefault();
        skip(-5000);
      } else if (e.key === "ArrowRight" || e.key === "l") {
        e.preventDefault();
        skip(5000);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggle, skip]);

  const dur = state.durationMs || durationMs || 0;

  return (
    <div className={cn("rounded-2xl border border-border bg-card p-4", className)}>
      <WaveformTimeline peaks={peaks} src={src} durationMs={dur} currentMs={state.currentMs} markers={markers} onSeek={seek} onMarkerClick={onMarkerClick} />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="icon" aria-label="Back 5 seconds" variant="ghost" onClick={() => skip(-5000)} disabled={!state.ready}>
          <RotateCcwIcon className="size-4" />
        </Button>
        <Button size="icon-lg" aria-label={state.playing ? "Pause" : "Play"} onClick={toggle} disabled={!state.ready || disabled} aria-keyshortcuts="Space k">
          {state.playing ? <PauseIcon className="size-5 fill-current" /> : <PlayIcon className="size-5 fill-current" />}
        </Button>
        <Button size="icon" aria-label="Forward 5 seconds" variant="ghost" onClick={() => skip(5000)} disabled={!state.ready}>
          <RotateCwIcon className="size-4" />
        </Button>
        <span className="ml-1 font-mono text-sm tabular-nums" aria-live="off">
          {formatMs(state.currentMs)} <span className="text-muted-foreground">/ {formatMs(dur)}</span>
        </span>
        <div className="ml-auto flex items-center gap-1" role="group" aria-label="Playback speed">
          {RATES.map((r) => (
            <button key={r} type="button" onClick={() => setRate(r)} aria-pressed={state.rate === r} className={cn("h-7 rounded-full px-2 text-xs font-medium tabular-nums", state.rate === r ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}>
              {r}×
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="icon-sm" variant="ghost" aria-label={state.volume === 0 ? "Unmute" : "Mute"} onClick={() => setVolume(state.volume === 0 ? 1 : 0)}>
            {state.volume === 0 ? <VolumeXIcon className="size-4" /> : <Volume2Icon className="size-4" />}
          </Button>
          <input type="range" min={0} max={1} step={0.05} value={state.volume} onChange={(e) => setVolume(Number(e.target.value))} aria-label="Volume" className="w-20 accent-foreground" />
        </div>
      </div>
      {(state.error || isError) && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {state.error ?? "Could not load the recording. Check your access and try again."}
        </p>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        Shortcuts: <kbd className="rounded border border-border px-1">Space</kbd> play/pause · <kbd className="rounded border border-border px-1">←</kbd>/<kbd className="rounded border border-border px-1">→</kbd> skip 5s · click the waveform to seek
      </p>
    </div>
  );
}

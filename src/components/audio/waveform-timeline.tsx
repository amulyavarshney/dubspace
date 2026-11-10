"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatMs } from "@/lib/format";
import { cn } from "@/lib/utils";

export type Marker = { id: string; ms: number; resolved?: boolean; active?: boolean; label?: string };

/**
 * Canvas waveform with click-to-seek, comment markers and an accessible slider
 * fallback. Peaks come from the server when available; otherwise they are decoded
 * client-side from the playback URL via WebAudio.
 */
export function WaveformTimeline({ peaks, src, durationMs, currentMs, markers = [], onSeek, onMarkerClick, className, height = 96 }: { peaks: number[] | null; src: string | null; durationMs: number; currentMs: number; markers?: Marker[]; onSeek: (ms: number) => void; onMarkerClick?: (m: Marker) => void; className?: string; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [decoded, setDecoded] = useState<number[] | null>(null);
  const [hoverMs, setHoverMs] = useState<number | null>(null);
  const data = peaks && peaks.length ? peaks : decoded;

  // Client-side decode fallback.
  useEffect(() => {
    if (peaks && peaks.length) return;
    if (!src) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(src);
        const buf = await res.arrayBuffer();
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        const audio = await ctx.decodeAudioData(buf);
        const ch = audio.getChannelData(0);
        const buckets = 400;
        const size = Math.max(1, Math.floor(ch.length / buckets));
        const out: number[] = [];
        for (let i = 0; i < ch.length && out.length < buckets; i += size) {
          let max = 0;
          for (let j = i; j < Math.min(ch.length, i + size); j++) max = Math.max(max, Math.abs(ch[j]));
          out.push(max);
        }
        await ctx.close();
        if (!cancelled) setDecoded(out);
      } catch {
        if (!cancelled) setDecoded([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src, peaks]);

  const bars = useMemo(() => (data && data.length ? data : Array.from({ length: 120 }, () => 0.15)), [data]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = wrap.clientWidth;
      const h = height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);
      const n = bars.length;
      const gap = 1.5;
      const bw = Math.max(1, (w - gap * (n - 1)) / n);
      const progress = durationMs > 0 ? Math.min(1, currentMs / durationMs) : 0;
      const styles = getComputedStyle(document.documentElement);
      const played = styles.getPropertyValue("--foreground").trim() || "#111";
      const rest = styles.getPropertyValue("--border").trim() || "#e4e4e7";
      const faded = !data || data.length === 0;
      for (let i = 0; i < n; i++) {
        const x = i * (bw + gap);
        const amp = Math.max(0.04, Math.min(1, bars[i]));
        const bh = Math.max(2, amp * (h - 8));
        const y = (h - bh) / 2;
        ctx.fillStyle = i / n <= progress ? played : rest;
        if (faded) ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.roundRect(x, y, bw, bh, bw / 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      // Playhead
      const px = progress * w;
      ctx.fillStyle = played;
      ctx.fillRect(px - 0.5, 0, 1, h);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [bars, currentMs, durationMs, height, data]);

  function msFromEvent(e: React.MouseEvent | React.PointerEvent) {
    const rect = wrapRef.current!.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return ratio * durationMs;
  }

  return (
    <div className={cn("relative select-none", className)}>
      <div
        ref={wrapRef}
        className="relative cursor-pointer rounded-xl bg-surface-muted px-0 py-1"
        onClick={(e) => durationMs > 0 && onSeek(msFromEvent(e))}
        onPointerMove={(e) => durationMs > 0 && setHoverMs(msFromEvent(e))}
        onPointerLeave={() => setHoverMs(null)}
        role="presentation"
      >
        <canvas ref={canvasRef} aria-hidden className="block w-full" />
        {hoverMs !== null && durationMs > 0 && (
          <div className="pointer-events-none absolute top-0 bottom-0" style={{ left: `${(hoverMs / durationMs) * 100}%` }}>
            <div className="h-full w-px bg-foreground/30" />
            <span className="absolute -top-6 -translate-x-1/2 rounded bg-foreground px-1.5 py-0.5 font-mono text-[10px] text-background tabular-nums">{formatMs(hoverMs)}</span>
          </div>
        )}
        {durationMs > 0 &&
          markers.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-label={`Comment at ${formatMs(m.ms)}${m.label ? `: ${m.label}` : ""}`}
              title={m.label}
              onClick={(e) => {
                e.stopPropagation();
                onMarkerClick?.(m);
                onSeek(m.ms);
              }}
              className={cn(
                "absolute -bottom-2 size-3 -translate-x-1/2 rounded-full border-2 border-background shadow-sm transition-transform hover:scale-125 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                m.active ? "scale-125 bg-foreground" : m.resolved ? "bg-success" : "bg-warning",
              )}
              style={{ left: `${Math.min(100, (m.ms / durationMs) * 100)}%` }}
            />
          ))}
      </div>
      <label className="sr-only" htmlFor="seek-slider">
        Seek position
      </label>
      <input
        id="seek-slider"
        type="range"
        min={0}
        max={Math.max(1, Math.round(durationMs))}
        step={100}
        value={Math.min(Math.round(currentMs), Math.max(1, Math.round(durationMs)))}
        onChange={(e) => onSeek(Number(e.target.value))}
        aria-valuetext={`${formatMs(currentMs)} of ${formatMs(durationMs)}`}
        className="sr-only focus:not-sr-only focus:mt-2 focus:block focus:w-full"
      />
    </div>
  );
}

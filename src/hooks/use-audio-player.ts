"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PlayerState = {
  playing: boolean;
  currentMs: number;
  durationMs: number;
  rate: number;
  volume: number;
  ready: boolean;
  error: string | null;
};

/** Thin controller around a native HTMLAudioElement with ms-based API. */
export function useAudioPlayer(fallbackDurationMs?: number | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const keyRef = useRef<string | null>(null);
  const [state, setState] = useState<PlayerState>({ playing: false, currentMs: 0, durationMs: fallbackDurationMs ?? 0, rate: 1, volume: 1, ready: false, error: null });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audioRef.current = audio;
    const onMeta = () => setState((s) => ({ ...s, durationMs: Number.isFinite(audio.duration) ? audio.duration * 1000 : (fallbackDurationMs ?? s.durationMs), ready: true, error: null }));
    const onPlay = () => setState((s) => ({ ...s, playing: true }));
    const onPause = () => setState((s) => ({ ...s, playing: false }));
    const onEnded = () => setState((s) => ({ ...s, playing: false, currentMs: s.durationMs }));
    const onError = () => setState((s) => ({ ...s, error: "Playback failed. The link may have expired; reload to continue.", playing: false }));
    const onTime = () => setState((s) => ({ ...s, currentMs: audio.currentTime * 1000 }));
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("durationchange", onMeta);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    audio.addEventListener("timeupdate", onTime);
    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("durationchange", onMeta);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("timeupdate", onTime);
      audio.src = "";
      audioRef.current = null;
    };
  }, [fallbackDurationMs]);

  /** Point the player at a (signed) URL. `key` identifies the recording so URL refreshes keep position. */
  const setSrc = useCallback(
    (src: string | null, key: string | null = null) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (!src) {
        if (keyRef.current === null && !audio.getAttribute("src")) return;
        audio.pause();
        audio.removeAttribute("src");
        keyRef.current = null;
        setState((s) => ({ ...s, ready: false, playing: false, currentMs: 0, durationMs: fallbackDurationMs ?? 0 }));
        return;
      }
      if (audio.src === src) return;
      const sameRecording = keyRef.current === key;
      const wasPlaying = !audio.paused;
      const pos = audio.currentTime;
      keyRef.current = key;
      audio.src = src;
      audio.load();
      if (sameRecording) {
        // Keep position when the signed URL is refreshed for the same recording.
        if (pos > 0) audio.currentTime = pos;
        if (wasPlaying) void audio.play().catch(() => undefined);
      } else {
        setState((s) => ({ ...s, currentMs: 0, playing: false, ready: false }));
      }
    },
    [fallbackDurationMs],
  );

  // Smooth time updates while playing.
  useEffect(() => {
    if (!state.playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    const tick = () => {
      const audio = audioRef.current;
      if (audio) setState((s) => (Math.abs(s.currentMs - audio.currentTime * 1000) > 10 ? { ...s, currentMs: audio.currentTime * 1000 } : s));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [state.playing]);

  const play = useCallback(() => audioRef.current?.play().catch(() => undefined), []);
  const pause = useCallback(() => audioRef.current?.pause(), []);
  const toggle = useCallback(() => (audioRef.current?.paused ? play() : pause()), [play, pause]);
  const seek = useCallback((ms: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const dur = Number.isFinite(audio.duration) ? audio.duration * 1000 : Infinity;
    const clamped = Math.max(0, Math.min(ms, dur));
    audio.currentTime = clamped / 1000;
    setState((s) => ({ ...s, currentMs: clamped }));
  }, []);
  const skip = useCallback((deltaMs: number) => seek((audioRef.current?.currentTime ?? 0) * 1000 + deltaMs), [seek]);
  const setRate = useCallback((rate: number) => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
    setState((s) => ({ ...s, rate }));
  }, []);
  const setVolume = useCallback((volume: number) => {
    if (audioRef.current) audioRef.current.volume = volume;
    setState((s) => ({ ...s, volume }));
  }, []);

  return { state, play, pause, toggle, seek, skip, setRate, setVolume, setSrc };
}

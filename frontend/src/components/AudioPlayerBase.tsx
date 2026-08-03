"use client";

import { useEffect, useMemo, useState } from 'react';
import { Pause, Play, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AudioPlayerBaseProps {
  /** Direct stream URL (preferred). Browser streams without full download. */
  audioUrl?: string | null;
  /** @deprecated Prefer audioUrl. Kept for local blob fallback. */
  audioBytes?: Uint8Array | null;
  mimeType?: string;
  loading?: boolean;
  error?: string | null;
  className?: string;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function AudioPlayerBase({
  audioUrl = null,
  audioBytes = null,
  mimeType = 'audio/wav',
  loading = false,
  error = null,
  className,
}: AudioPlayerBaseProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [htmlAudio, setHtmlAudio] = useState<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [mediaError, setMediaError] = useState<string | null>(null);

  // Blob fallback when only bytes are provided
  useEffect(() => {
    if (audioUrl || !audioBytes) {
      setBlobUrl(null);
      return;
    }

    const blob = new Blob([audioBytes as BlobPart], { type: mimeType });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [audioUrl, audioBytes, mimeType]);

  const src = audioUrl || blobUrl;

  useEffect(() => {
    if (!src) {
      setHtmlAudio(null);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setMediaError(null);
      return;
    }

    const el = new Audio(src);
    el.preload = 'metadata';

    const onTime = () => setCurrentTime(el.currentTime);
    const onMeta = () => setDuration(el.duration || 0);
    const onEnd = () => setIsPlaying(false);
    const onErr = () => {
      setMediaError('Failed to load audio');
      setIsPlaying(false);
    };

    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('ended', onEnd);
    el.addEventListener('error', onErr);

    setHtmlAudio(el);
    setMediaError(null);

    return () => {
      el.pause();
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('ended', onEnd);
      el.removeEventListener('error', onErr);
      el.src = '';
    };
  }, [src]);

  const controls = useMemo(() => ({
    play: async () => {
      if (!htmlAudio) return;
      await htmlAudio.play();
      setIsPlaying(true);
    },
    pause: () => {
      htmlAudio?.pause();
      setIsPlaying(false);
    },
    seek: (t: number) => {
      if (!htmlAudio) return;
      htmlAudio.currentTime = t;
      setCurrentTime(t);
    },
  }), [htmlAudio]);

  const displayError = error || mediaError;

  return (
    <div className={`flex items-center gap-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded-md ${className || ''}`}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={loading || !!displayError || !src}
        onClick={() => {
          if (isPlaying) controls.pause();
          else void controls.play();
        }}
        className="shrink-0"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </Button>
      <div className="flex-1 min-w-0">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime || 0}
          disabled={!duration}
          onChange={(e) => controls.seek(Number(e.target.value))}
          className="w-full accent-blue-600"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-0.5">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
      {displayError && (
        <span className="text-xs text-red-600 shrink-0 max-w-[40%] truncate" title={displayError}>
          {displayError}
        </span>
      )}
    </div>
  );
}

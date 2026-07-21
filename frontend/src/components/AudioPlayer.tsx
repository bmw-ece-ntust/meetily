"use client";

import { useEffect, useMemo, useState } from 'react';
import { Pause, Play, Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { Button } from '@/components/ui/button';

type CommandResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

interface AudioPlayerProps {
  meetingId: string;
  hasRecording?: boolean;
  className?: string;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function AudioPlayer({ meetingId, hasRecording = true, className }: AudioPlayerProps) {
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const player = useAudioPlayer(audioPath);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;

    const load = async () => {
      if (!meetingId || !hasRecording) {
        setAudioPath(null);
        return;
      }
      setLoading(true);
      setLoadError(null);
      try {
        const result = await invoke<CommandResult<number[]>>('get_meeting_recording', {
          meetingId,
        });
        if (!result.success || !result.data?.length) {
          throw new Error(result.error || 'No recording available');
        }
        if (cancelled) return;
        const bytes = new Uint8Array(result.data);
        const blob = new Blob([bytes], { type: 'audio/mp4' });
        const url = URL.createObjectURL(blob);
        revoked = url;
        // useAudioPlayer expects a filesystem path via read_audio_file.
        // Bridge: write temp via convertObjectUrl path — use blob URL with HTML audio fallback below.
        setAudioPath(url);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : String(e));
          setAudioPath(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [meetingId, hasRecording]);

  // useAudioPlayer only supports local paths via Tauri. For blob URLs use HTMLAudioElement.
  const [htmlAudio, setHtmlAudio] = useState<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!audioPath || !audioPath.startsWith('blob:')) {
      setHtmlAudio(null);
      return;
    }
    const el = new Audio(audioPath);
    el.preload = 'auto';
    const onTime = () => setCurrentTime(el.currentTime);
    const onMeta = () => setDuration(el.duration || 0);
    const onEnd = () => setIsPlaying(false);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('ended', onEnd);
    setHtmlAudio(el);
    return () => {
      el.pause();
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('ended', onEnd);
    };
  }, [audioPath]);

  const useHtml = Boolean(audioPath?.startsWith('blob:'));

  const display = useMemo(() => {
    if (useHtml) {
      return {
        isPlaying,
        currentTime,
        duration,
        error: loadError,
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
      };
    }
    return {
      isPlaying: player.isPlaying,
      currentTime: player.currentTime,
      duration: player.duration,
      error: loadError || player.error,
      play: player.play,
      pause: player.pause,
      seek: player.seek,
    };
  }, [useHtml, isPlaying, currentTime, duration, loadError, htmlAudio, player]);

  if (!hasRecording) return null;

  return (
    <div className={`flex items-center gap-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded-md ${className || ''}`}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={loading || !!display.error || !audioPath}
        onClick={() => {
          if (display.isPlaying) display.pause();
          else void display.play();
        }}
        className="shrink-0"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : display.isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </Button>
      <div className="flex-1 min-w-0">
        <input
          type="range"
          min={0}
          max={display.duration || 0}
          step={0.1}
          value={display.currentTime || 0}
          disabled={!display.duration}
          onChange={(e) => display.seek(Number(e.target.value))}
          className="w-full accent-blue-600"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-0.5">
          <span>{formatTime(display.currentTime)}</span>
          <span>{formatTime(display.duration)}</span>
        </div>
      </div>
      {display.error && (
        <span className="text-xs text-red-600 shrink-0 max-w-[40%] truncate" title={display.error}>
          {display.error}
        </span>
      )}
    </div>
  );
}

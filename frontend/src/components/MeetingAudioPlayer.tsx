"use client";

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AudioPlayerBase } from '@/components/AudioPlayerBase';

type CommandResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

interface MeetingAudioPlayerProps {
  meetingId: string;
  hasRecording?: boolean;
  className?: string;
}

export function MeetingAudioPlayer({ 
  meetingId, 
  hasRecording = true, 
  className 
}: MeetingAudioPlayerProps) {
  const [audioBytes, setAudioBytes] = useState<Uint8Array | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!meetingId || !hasRecording) {
        setAudioBytes(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await invoke<CommandResult<number[]>>('get_meeting_recording', {
          meetingId,
        });

        if (!result.success || !result.data?.length) {
          throw new Error(result.error || 'No recording available');
        }

        if (cancelled) return;

        const bytes = new Uint8Array(result.data);
        setAudioBytes(bytes);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setAudioBytes(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [meetingId, hasRecording]);

  if (!hasRecording) return null;

  return (
    <AudioPlayerBase
      audioBytes={audioBytes}
      mimeType="audio/mp4"
      loading={loading}
      error={error}
      className={className}
    />
  );
}

"use client";

import { useEffect, useState } from 'react';
import { AudioPlayerBase } from '@/components/AudioPlayerBase';
import { meetingRecordingUrl } from '@/lib/mediaUrl';

interface MeetingAudioPlayerProps {
  meetingId: string;
  hasRecording?: boolean;
  className?: string;
}

export function MeetingAudioPlayer({
  meetingId,
  hasRecording = true,
  className,
}: MeetingAudioPlayerProps) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!meetingId || !hasRecording) {
        setAudioUrl(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const url = await meetingRecordingUrl(meetingId);
        if (!cancelled) setAudioUrl(url);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setAudioUrl(null);
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
      audioUrl={audioUrl}
      loading={loading}
      error={error}
      className={className}
    />
  );
}

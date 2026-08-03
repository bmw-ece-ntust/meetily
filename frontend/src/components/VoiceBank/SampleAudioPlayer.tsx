"use client";

import { useEffect, useState } from 'react';
import { AudioPlayerBase } from '@/components/AudioPlayerBase';
import { personSampleAudioUrl } from '@/lib/mediaUrl';

interface SampleAudioPlayerProps {
  personId: string;
  sampleId: string;
  className?: string;
}

export function SampleAudioPlayer({
  personId,
  sampleId,
  className,
}: SampleAudioPlayerProps) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!personId || !sampleId) {
        setAudioUrl(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const url = await personSampleAudioUrl(personId, sampleId);
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
  }, [personId, sampleId]);

  return (
    <AudioPlayerBase
      audioUrl={audioUrl}
      mimeType="audio/wav"
      loading={loading}
      error={error}
      className={className}
    />
  );
}

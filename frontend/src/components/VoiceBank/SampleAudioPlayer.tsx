"use client";

import { useEffect, useState } from 'react';
import { voiceBankApiService } from '@/services/voiceBankApiService';
import { AudioPlayerBase } from '@/components/AudioPlayerBase';

interface SampleAudioPlayerProps {
  personId: string;
  sampleId: string;
  className?: string;
}

export function SampleAudioPlayer({ 
  personId, 
  sampleId, 
  className 
}: SampleAudioPlayerProps) {
  const [audioBytes, setAudioBytes] = useState<Uint8Array | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!personId || !sampleId) {
        setAudioBytes(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const bytes = await voiceBankApiService.getSampleAudio(personId, sampleId);

        if (cancelled) return;

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
  }, [personId, sampleId]);

  return (
    <AudioPlayerBase
      audioBytes={audioBytes}
      mimeType="audio/wav"
      loading={loading}
      error={error}
      className={className}
    />
  );
}

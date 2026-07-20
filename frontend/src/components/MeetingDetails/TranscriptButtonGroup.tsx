"use client";

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Copy, RefreshCw, Loader2 } from 'lucide-react';
import Analytics from '@/lib/analytics';
import { toast } from 'sonner';
import { meetingApiService } from '@/services/meetingApiService';

interface TranscriptButtonGroupProps {
  transcriptCount: number;
  onCopyTranscript: () => void;
  meetingId?: string;
  onRefetchTranscripts?: () => Promise<void>;
}

export function TranscriptButtonGroup({
  transcriptCount,
  onCopyTranscript,
  meetingId,
  onRefetchTranscripts,
}: TranscriptButtonGroupProps) {
  const [isRetranscribing, setIsRetranscribing] = useState(false);

  const handleRetranscribe = useCallback(async () => {
    if (!meetingId || isRetranscribing) return;

    setIsRetranscribing(true);
    Analytics.trackButtonClick('enhance_transcript', 'meeting_details');

    try {
      const { job_id } = await meetingApiService.retranscribeMeeting(meetingId);
      toast.info('Retranscription started', {
        description: `Job ${job_id}`,
      });

      // Poll job until complete, then refresh transcripts
      for (let i = 0; i < 200; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const status = await meetingApiService.getJobStatus(job_id);
        const state = status.state?.toLowerCase();
        if (state === 'completed') {
          toast.success('Retranscription complete');
          await onRefetchTranscripts?.();
          return;
        }
        if (state === 'failed' || state === 'cancelled') {
          throw new Error(status.error || `Retranscription ${state}`);
        }
      }
      throw new Error('Retranscription timed out');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error('Retranscription failed', { description: message });
    } finally {
      setIsRetranscribing(false);
    }
  }, [meetingId, isRetranscribing, onRefetchTranscripts]);

  return (
    <div className="flex items-center justify-center w-full gap-2">
      <ButtonGroup>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            Analytics.trackButtonClick('copy_transcript', 'meeting_details');
            onCopyTranscript();
          }}
          disabled={transcriptCount === 0}
          title={transcriptCount === 0 ? 'No transcript available' : 'Copy Transcript'}
        >
          <Copy />
          <span className="hidden lg:inline">Copy</span>
        </Button>

        {meetingId && (
          <Button
            size="sm"
            variant="outline"
            className="bg-gradient-to-r from-blue-50 to-purple-50 hover:from-blue-100 hover:to-purple-100 border-blue-200 xl:px-4"
            onClick={() => { void handleRetranscribe(); }}
            disabled={isRetranscribing}
            title="Retranscribe audio"
          >
            {isRetranscribing ? (
              <Loader2 className="xl:mr-2 animate-spin" size={18} />
            ) : (
              <RefreshCw className="xl:mr-2" size={18} />
            )}
            <span className="hidden lg:inline">
              {isRetranscribing ? 'Retranscribing...' : 'Enhance'}
            </span>
          </Button>
        )}
      </ButtonGroup>
    </div>
  );
}

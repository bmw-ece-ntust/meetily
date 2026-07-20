"use client";

import { useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Copy, RefreshCw, Loader2 } from 'lucide-react';
import Analytics from '@/lib/analytics';
import { toast } from 'sonner';
import { useJobQueue } from '@/contexts/JobQueueContext';

interface TranscriptButtonGroupProps {
  transcriptCount: number;
  onCopyTranscript: () => void;
  meetingId?: string;
  meetingTitle?: string;
  onRefetchTranscripts?: () => Promise<void>;
}

export function TranscriptButtonGroup({
  transcriptCount,
  onCopyTranscript,
  meetingId,
  meetingTitle,
  onRefetchTranscripts,
}: TranscriptButtonGroupProps) {
  const { enqueueRetranscribe, isMeetingBusy, jobs } = useJobQueue();

  const isRetranscribing = useMemo(() => {
    if (!meetingId) return false;
    return isMeetingBusy(meetingId, 'retranscribe');
  }, [isMeetingBusy, meetingId, jobs]);

  const handleRetranscribe = useCallback(() => {
    if (!meetingId || isRetranscribing) return;

    Analytics.trackButtonClick('enhance_transcript', 'meeting_details');

    enqueueRetranscribe({
      meetingId,
      meetingTitle: meetingTitle || meetingId,
      onComplete: async () => {
        try {
          await onRefetchTranscripts?.();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          toast.error('Failed to refresh transcript', { description: message });
        }
      },
    });
  }, [
    enqueueRetranscribe,
    isRetranscribing,
    meetingId,
    meetingTitle,
    onRefetchTranscripts,
  ]);

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
            onClick={handleRetranscribe}
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

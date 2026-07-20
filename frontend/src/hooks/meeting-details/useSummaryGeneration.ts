import { useCallback, useState } from 'react';
import { Summary, Transcript } from '@/types';
import { toast } from 'sonner';
import { meetingApiService } from '@/services/meetingApiService';

type SummaryStatus = 'idle' | 'processing' | 'summarizing' | 'regenerating' | 'completed' | 'error';

interface UseSummaryGenerationProps {
  meeting: any;
  transcripts: Transcript[];
  selectedTemplate: string;
  setAiSummary: (summary: Summary | null) => void;
  onMeetingUpdated?: () => Promise<void>;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useSummaryGeneration({
  meeting,
  transcripts,
  selectedTemplate,
  setAiSummary,
  onMeetingUpdated,
}: UseSummaryGenerationProps) {
  const [summaryStatus, setSummaryStatus] = useState<SummaryStatus>('idle');
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const getSummaryStatusMessage = useCallback((status: SummaryStatus) => {
    switch (status) {
      case 'processing':
        return 'Starting summary job...';
      case 'summarizing':
        return 'Generating summary...';
      case 'regenerating':
        return 'Regenerating summary...';
      case 'completed':
        return 'Summary completed';
      case 'error':
        return 'Error generating summary';
      default:
        return '';
    }
  }, []);

  const runSummaryJob = useCallback(async (isRegeneration = false) => {
    if (!transcripts.length) {
      toast.error('No transcripts available for summary');
      return;
    }

    setSummaryStatus(isRegeneration ? 'regenerating' : 'processing');
    setSummaryError(null);

    try {
      const jobId = await meetingApiService.generateSummary(meeting.id, selectedTemplate, null);
      setSummaryStatus('summarizing');
      toast.info(isRegeneration ? 'Regenerating summary...' : 'Generating summary...');

      for (let attempt = 0; attempt < 200; attempt += 1) {
        const status = await meetingApiService.getJobStatus(jobId);
        const state = status.state?.toLowerCase();

        if (state === 'completed') {
          const summary = await meetingApiService.getSummary(meeting.id);
          if (!summary) throw new Error('Summary job completed but no summary was returned');
          setAiSummary(summary);
          setSummaryStatus('completed');
          toast.success('Summary generated successfully');
          await onMeetingUpdated?.();
          return;
        }

        if (state === 'failed' || state === 'cancelled') {
          throw new Error(status.error || `Summary job ${state}`);
        }

        await delay(3000);
      }

      throw new Error('Summary generation timed out');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSummaryError(message);
      setSummaryStatus('error');
      toast.error(isRegeneration ? 'Failed to regenerate summary' : 'Failed to generate summary', {
        description: message,
      });
    }
  }, [meeting.id, onMeetingUpdated, selectedTemplate, setAiSummary, transcripts.length]);

  const handleGenerateSummary = useCallback(async () => {
    await runSummaryJob(false);
  }, [runSummaryJob]);

  const handleRegenerateSummary = useCallback(async () => {
    await runSummaryJob(true);
  }, [runSummaryJob]);

  const handleStopGeneration = useCallback(() => {
    setSummaryStatus('idle');
    setSummaryError(null);
    toast.info('Summary generation stopped');
  }, []);

  return {
    summaryStatus,
    summaryError,
    handleGenerateSummary,
    handleRegenerateSummary,
    handleStopGeneration,
    getSummaryStatusMessage,
  };
}

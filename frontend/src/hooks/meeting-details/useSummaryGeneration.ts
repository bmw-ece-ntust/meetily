import { useCallback, useEffect, useMemo, useState } from 'react';
import { Summary, Transcript } from '@/types';
import { toast } from 'sonner';
import { meetingApiService } from '@/services/meetingApiService';
import { useJobQueue } from '@/contexts/JobQueueContext';

type SummaryStatus = 'idle' | 'processing' | 'summarizing' | 'regenerating' | 'completed' | 'error';

interface UseSummaryGenerationProps {
  meeting: any;
  transcripts: Transcript[];
  selectedTemplate: string;
  setAiSummary: (summary: Summary | null) => void;
  onMeetingUpdated?: () => Promise<void>;
}

export function useSummaryGeneration({
  meeting,
  transcripts,
  selectedTemplate,
  setAiSummary,
  onMeetingUpdated,
}: UseSummaryGenerationProps) {
  const { enqueueSummary, jobs, cancelLocal, isMeetingBusy } = useJobQueue();
  const [summaryStatus, setSummaryStatus] = useState<SummaryStatus>('idle');
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [activeLocalId, setActiveLocalId] = useState<string | null>(null);
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);

  const meetingSummaryJob = useMemo(
    () =>
      jobs.find(
        (j) =>
          j.meetingId === meeting.id &&
          j.type === 'summary' &&
          j.state !== 'completed' &&
          j.state !== 'failed' &&
          j.state !== 'cancelled'
      ),
    [jobs, meeting.id]
  );

  // Mirror queue state into local summaryStatus for existing UI
  useEffect(() => {
    if (!meetingSummaryJob) {
      if (summaryStatus === 'processing' || summaryStatus === 'summarizing' || summaryStatus === 'regenerating') {
        // Job disappeared without terminal update — leave status as-is until explicit reset
      }
      return;
    }

    setActiveLocalId(meetingSummaryJob.id);
    setSummaryError(meetingSummaryJob.error || null);

    if (meetingSummaryJob.state === 'queued' || meetingSummaryJob.state === 'starting') {
      setSummaryStatus(isRegenerating ? 'regenerating' : 'processing');
    } else if (
      meetingSummaryJob.state === 'pending' ||
      meetingSummaryJob.state === 'processing'
    ) {
      setSummaryStatus(isRegenerating ? 'regenerating' : 'summarizing');
    }
  }, [meetingSummaryJob, isRegenerating, summaryStatus]);

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

  /** Load existing summary for a template. Returns true if found. Does not start generation. */
  const loadTemplateSummary = useCallback(
    async (templateId: string): Promise<boolean> => {
      if (!meeting?.id) return false;
      setIsLoadingTemplate(true);
      setSummaryError(null);
      try {
        const summary = await meetingApiService.getSummary(meeting.id, templateId);
        if (summary) {
          setAiSummary(summary);
          setSummaryStatus('completed');
          return true;
        }
        setAiSummary(null);
        setSummaryStatus('idle');
        return false;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setAiSummary(null);
        setSummaryStatus('idle');
        setSummaryError(message);
        return false;
      } finally {
        setIsLoadingTemplate(false);
      }
    },
    [meeting?.id, setAiSummary]
  );

  const runSummaryJob = useCallback(async (isRegeneration = false) => {
    if (!transcripts.length) {
      toast.error('No transcripts available for summary');
      return;
    }

    if (isMeetingBusy(meeting.id, 'summary')) {
      toast.info('Summary already in progress for this meeting');
      return;
    }

    setIsRegenerating(isRegeneration);
    setSummaryStatus(isRegeneration ? 'regenerating' : 'processing');
    setSummaryError(null);

    const templateForJob = selectedTemplate;

    const localId = enqueueSummary({
      meetingId: meeting.id,
      template: templateForJob,
      language: null,
      meetingTitle: meeting.title || meeting.id,
      isRegeneration,
      onComplete: async (meetingId) => {
        try {
          const summary = await meetingApiService.getSummary(meetingId, templateForJob);
          if (!summary) throw new Error('Summary job completed but no summary was returned');
          setAiSummary(summary);
          setSummaryStatus('completed');
          setSummaryError(null);
          setActiveLocalId(null);
          await onMeetingUpdated?.();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setSummaryError(message);
          setSummaryStatus('error');
          toast.error('Failed to load summary', { description: message });
        }
      },
      onError: (error) => {
        setSummaryError(error);
        setSummaryStatus('error');
        setActiveLocalId(null);
      },
    });

    setActiveLocalId(localId);
  }, [
    enqueueSummary,
    isMeetingBusy,
    meeting.id,
    meeting.title,
    onMeetingUpdated,
    selectedTemplate,
    setAiSummary,
    transcripts.length,
  ]);

  const handleGenerateSummary = useCallback(async () => {
    await runSummaryJob(false);
  }, [runSummaryJob]);

  const handleRegenerateSummary = useCallback(async () => {
    await runSummaryJob(true);
  }, [runSummaryJob]);

  const handleStopGeneration = useCallback(() => {
    if (activeLocalId) {
      cancelLocal(activeLocalId);
    }
    setSummaryStatus('idle');
    setSummaryError(null);
    setActiveLocalId(null);
    toast.info('Summary generation stopped');
  }, [activeLocalId, cancelLocal]);

  return {
    summaryStatus,
    summaryError,
    isLoadingTemplate,
    loadTemplateSummary,
    handleGenerateSummary,
    handleRegenerateSummary,
    handleStopGeneration,
    getSummaryStatusMessage,
  };
}

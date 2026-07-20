"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Summary } from '@/types';
import Analytics from '@/lib/analytics';
import { TranscriptPanel } from '@/components/MeetingDetails/TranscriptPanel';
import { SummaryPanel } from '@/components/MeetingDetails/SummaryPanel';
import { useMeetingData } from '@/hooks/meeting-details/useMeetingData';
import { useSummaryGeneration } from '@/hooks/meeting-details/useSummaryGeneration';
import { useCopyOperations } from '@/hooks/meeting-details/useCopyOperations';

const WIDTH_STORAGE_KEY = 'meetily.transcriptPanelWidth';
const DEFAULT_WIDTH_PCT = 33;
const MIN_WIDTH_PCT = 20;
const MAX_WIDTH_PCT = 60;

function loadStoredWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_WIDTH_PCT;
  const raw = localStorage.getItem(WIDTH_STORAGE_KEY);
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed)) return DEFAULT_WIDTH_PCT;
  return Math.min(MAX_WIDTH_PCT, Math.max(MIN_WIDTH_PCT, parsed));
}

export default function PageContent({
  meeting,
  summaryData,
  shouldAutoGenerate = false,
  onAutoGenerateComplete,
  onMeetingUpdated,
  onRefetchTranscripts,
}: {
  meeting: any;
  summaryData: Summary | null;
  shouldAutoGenerate?: boolean;
  onAutoGenerateComplete?: () => void;
  onMeetingUpdated?: () => Promise<void>;
  onRefetchTranscripts?: () => Promise<void>;
}) {
  const [selectedTemplate, setSelectedTemplate] = useState<string>('full');
  const [transcriptWidthPct, setTranscriptWidthPct] = useState(DEFAULT_WIDTH_PCT);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const availableTemplates = [
    { id: 'key_points', name: 'Key Points', description: 'Extract main points from the meeting' },
    { id: 'action_items', name: 'Action Items', description: 'List action items and tasks' },
    { id: 'decisions', name: 'Decisions', description: 'Summarize decisions made' },
    { id: 'full', name: 'Full Summary', description: 'Complete meeting summary' },
  ];

  const meetingData = useMeetingData({ meeting, summaryData, onMeetingUpdated });

  const summaryGeneration = useSummaryGeneration({
    meeting,
    transcripts: meetingData.transcripts,
    selectedTemplate,
    onMeetingUpdated,
    setAiSummary: meetingData.setAiSummary,
  });

  const copyOperations = useCopyOperations({
    meeting,
    transcripts: meetingData.transcripts,
    meetingTitle: meetingData.meetingTitle,
    aiSummary: meetingData.aiSummary,
    blockNoteSummaryRef: meetingData.blockNoteSummaryRef,
  });

  useEffect(() => {
    setTranscriptWidthPct(loadStoredWidth());
  }, []);

  useEffect(() => {
    Analytics.trackPageView('meeting_details');
  }, []);

  useEffect(() => {
    let cancelled = false;
    const autoGenerate = async () => {
      if (shouldAutoGenerate && meetingData.transcripts.length > 0 && !cancelled) {
        await summaryGeneration.handleGenerateSummary();
        if (onAutoGenerateComplete && !cancelled) onAutoGenerateComplete();
      }
    };
    autoGenerate();
    return () => { cancelled = true; };
  }, [shouldAutoGenerate, meeting.id]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.min(MAX_WIDTH_PCT, Math.max(MIN_WIDTH_PCT, pct));
      setTranscriptWidthPct(clamped);
    };

    const onUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setTranscriptWidthPct((current) => {
        localStorage.setItem(WIDTH_STORAGE_KEY, String(current));
        return current;
      });
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="flex flex-col h-screen bg-gray-50"
    >
      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        <TranscriptPanel
          transcripts={meetingData.transcripts}
          onCopyTranscript={copyOperations.handleCopyTranscript}
          isRecording={false}
          disableAutoScroll={true}
          meetingId={meeting.id}
          meetingTitle={meetingData.meetingTitle || meeting.title}
          onRefetchTranscripts={onRefetchTranscripts}
          className="hidden md:flex min-w-0 min-h-0 bg-white flex-col relative shrink-0"
          style={{ width: `${transcriptWidthPct}%` }}
        />
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize transcript panel"
          onMouseDown={handleResizeStart}
          className="hidden md:flex w-1 shrink-0 cursor-col-resize bg-gray-200 hover:bg-blue-400 active:bg-blue-500 transition-colors"
        />
        <SummaryPanel
          meeting={meeting}
          meetingTitle={meetingData.meetingTitle}
          summaryRef={meetingData.blockNoteSummaryRef}
          onCopySummary={copyOperations.handleCopySummary}
          aiSummary={meetingData.aiSummary}
          summaryStatus={summaryGeneration.summaryStatus}
          transcripts={meetingData.transcripts}
          onGenerateSummary={summaryGeneration.handleGenerateSummary}
          onStopGeneration={summaryGeneration.handleStopGeneration}
          onSaveSummary={meetingData.handleSaveSummary}
          onRegenerateSummary={summaryGeneration.handleRegenerateSummary}
          availableTemplates={availableTemplates}
          selectedTemplate={selectedTemplate}
          onTemplateSelect={(templateId) => setSelectedTemplate(templateId)}
          onSummaryChange={meetingData.setAiSummary}
          onDirtyChange={() => {}}
          summaryError={summaryGeneration.summaryError}
          getSummaryStatusMessage={summaryGeneration.getSummaryStatusMessage}
        />
      </div>
    </motion.div>
  );
}

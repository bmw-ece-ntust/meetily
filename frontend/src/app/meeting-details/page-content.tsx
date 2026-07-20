"use client";
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Summary } from '@/types';
import Analytics from '@/lib/analytics';
import { TranscriptPanel } from '@/components/MeetingDetails/TranscriptPanel';
import { SummaryPanel } from '@/components/MeetingDetails/SummaryPanel';
import { useMeetingData } from '@/hooks/meeting-details/useMeetingData';
import { useSummaryGeneration } from '@/hooks/meeting-details/useSummaryGeneration';
import { useCopyOperations } from '@/hooks/meeting-details/useCopyOperations';

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="flex flex-col h-screen bg-gray-50"
    >
      <div className="flex flex-1 overflow-hidden">
        <TranscriptPanel
          transcripts={meetingData.transcripts}
          onCopyTranscript={copyOperations.handleCopyTranscript}
          isRecording={false}
          disableAutoScroll={true}
          meetingId={meeting.id}
          onRefetchTranscripts={onRefetchTranscripts}
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

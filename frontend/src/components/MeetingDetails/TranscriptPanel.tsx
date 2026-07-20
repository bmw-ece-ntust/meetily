"use client";

import { Transcript } from '@/types';
import { TranscriptView } from '@/components/TranscriptView';
import { TranscriptButtonGroup } from './TranscriptButtonGroup';

interface TranscriptPanelProps {
  transcripts: Transcript[];
  onCopyTranscript: () => void;
  isRecording: boolean;
  disableAutoScroll?: boolean;
  meetingId?: string;
  onRefetchTranscripts?: () => Promise<void>;
}

export function TranscriptPanel({
  transcripts,
  onCopyTranscript,
  isRecording,
  meetingId,
  onRefetchTranscripts,
}: TranscriptPanelProps) {
  return (
    <div className="hidden md:flex md:w-1/4 lg:w-1/3 min-w-0 min-h-0 border-r border-gray-200 bg-white flex-col relative shrink-0">
      <div className="p-4 border-b border-gray-200">
        <TranscriptButtonGroup
          transcriptCount={transcripts?.length || 0}
          onCopyTranscript={onCopyTranscript}
          meetingId={meetingId}
          onRefetchTranscripts={onRefetchTranscripts}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pb-4">
        <TranscriptView
          transcripts={transcripts}
          isRecording={isRecording}
          isPaused={false}
          isProcessing={false}
          isStopping={false}
          enableStreaming={false}
        />
      </div>
    </div>
  );
}

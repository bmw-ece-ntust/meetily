"use client";

import { Transcript } from '@/types';
import { TranscriptView } from '@/components/TranscriptView';
import { TranscriptButtonGroup } from './TranscriptButtonGroup';
import { CSSProperties } from 'react';

interface TranscriptPanelProps {
  transcripts: Transcript[];
  onCopyTranscript: () => void;
  isRecording: boolean;
  disableAutoScroll?: boolean;
  meetingId?: string;
  onRefetchTranscripts?: () => Promise<void>;
  style?: CSSProperties;
  className?: string;
}

export function TranscriptPanel({
  transcripts,
  onCopyTranscript,
  isRecording,
  meetingId,
  onRefetchTranscripts,
  style,
  className,
}: TranscriptPanelProps) {
  return (
    <div
      className={className ?? 'hidden md:flex min-w-0 min-h-0 border-r border-gray-200 bg-white flex-col relative shrink-0'}
      style={style}
    >
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

"use client";

import { useEffect, useMemo, useState } from 'react';
import { Transcript } from '@/types';
import { TranscriptView } from '@/components/TranscriptView';
import { TranscriptButtonGroup, TranscriptDisplayMode } from './TranscriptButtonGroup';
import { CSSProperties } from 'react';

const MODE_STORAGE_KEY = 'transcriptDisplayMode';

function loadStoredMode(hasRefined: boolean): TranscriptDisplayMode {
  if (typeof window === 'undefined') return hasRefined ? 'refined' : 'raw';
  const stored = localStorage.getItem(MODE_STORAGE_KEY);
  if (stored === 'refined' && hasRefined) return 'refined';
  if (stored === 'raw') return 'raw';
  return hasRefined ? 'refined' : 'raw';
}

interface TranscriptPanelProps {
  transcripts: Transcript[];
  personNames?: { [personId: string]: string }; // Voice bank person names
  refinedText?: string | null;
  onCopyTranscript: () => void;
  isRecording: boolean;
  disableAutoScroll?: boolean;
  meetingId?: string;
  meetingTitle?: string;
  onRefetchTranscripts?: () => Promise<void>;
  onDisplayModeChange?: (mode: TranscriptDisplayMode) => void;
  style?: CSSProperties;
  className?: string;
}

export function TranscriptPanel({
  transcripts,
  personNames = {},
  refinedText = null,
  onCopyTranscript,
  isRecording,
  meetingId,
  meetingTitle,
  onRefetchTranscripts,
  onDisplayModeChange,
  style,
  className,
}: TranscriptPanelProps) {
  const hasSegmentRefined = useMemo(
    () => transcripts.some((t) => Boolean(t.refined_text?.trim())),
    [transcripts]
  );
  const hasDocRefined = Boolean(refinedText?.trim());
  const hasRefined = hasSegmentRefined || hasDocRefined;

  const [displayMode, setDisplayMode] = useState<TranscriptDisplayMode>(() =>
    loadStoredMode(hasRefined)
  );

  useEffect(() => {
    let next = displayMode;
    if (displayMode === 'refined' && !hasRefined) {
      next = 'raw';
    } else if (displayMode === 'raw' && hasRefined) {
      const stored = typeof window !== 'undefined' ? localStorage.getItem(MODE_STORAGE_KEY) : null;
      if (stored !== 'raw') {
        next = 'refined';
      }
    }
    if (next !== displayMode) {
      setDisplayMode(next);
    }
    onDisplayModeChange?.(next);
  }, [hasRefined, displayMode, onDisplayModeChange]);

  const handleModeChange = (mode: TranscriptDisplayMode) => {
    setDisplayMode(mode);
    localStorage.setItem(MODE_STORAGE_KEY, mode);
    onDisplayModeChange?.(mode);
  };

  const displayTranscripts = useMemo(() => {
    if (displayMode !== 'refined') {
      return transcripts;
    }

    // Prefer per-segment refined text (keeps timestamps / speakers).
    if (hasSegmentRefined) {
      return transcripts.map((t) => ({
        ...t,
        text: t.refined_text?.trim() || t.text,
      }));
    }

    // Fallback: document-level refined blob as one row.
    if (refinedText?.trim()) {
      return [
        {
          id: 'refined-transcript',
          text: refinedText.trim(),
          timestamp: '',
        } satisfies Transcript,
      ];
    }

    return transcripts;
  }, [displayMode, hasSegmentRefined, refinedText, transcripts]);

  return (
    <div
      className={className ?? 'hidden md:flex min-w-0 min-h-0 border-r border-gray-200 bg-white flex-col relative shrink-0'}
      style={style}
    >
      <div className="p-4 border-b border-gray-200">
        <TranscriptButtonGroup
          transcriptCount={displayTranscripts?.length || 0}
          onCopyTranscript={onCopyTranscript}
          meetingId={meetingId}
          meetingTitle={meetingTitle}
          onRefetchTranscripts={onRefetchTranscripts}
          displayMode={displayMode}
          onDisplayModeChange={handleModeChange}
          hasRefined={hasRefined}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pb-4">
        <TranscriptView
          transcripts={displayTranscripts}
          personNames={personNames}
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

import { useCallback, RefObject } from 'react';
import { Transcript, Summary } from '@/types';
import { BlockNoteSummaryViewRef } from '@/components/AISummary/BlockNoteSummaryView';
import { toast } from 'sonner';
import Analytics from '@/lib/analytics';
import { meetingApiService } from '@/services/meetingApiService';
import type { TranscriptDisplayMode } from '@/components/MeetingDetails/TranscriptButtonGroup';

interface UseCopyOperationsProps {
  meeting: any;
  transcripts: Transcript[];
  meetingTitle: string;
  aiSummary: Summary | null;
  blockNoteSummaryRef: RefObject<BlockNoteSummaryViewRef>;
  refinedText?: string | null;
  displayMode?: TranscriptDisplayMode;
}

export function useCopyOperations({
  meeting,
  transcripts,
  meetingTitle,
  aiSummary,
  blockNoteSummaryRef,
  refinedText = null,
  displayMode = 'raw',
}: UseCopyOperationsProps) {

  // Copy transcript to clipboard
  const handleCopyTranscript = useCallback(async () => {
    const header = `# Transcript of the Meeting: ${meeting.id} - ${meetingTitle ?? meeting.title}\n\n`;
    const date = `## Date: ${new Date(meeting.created_at).toLocaleDateString()}\n\n`;

    let allTranscripts = transcripts;
    let docRefined = refinedText;
    try {
      const payload = await meetingApiService.getTranscript(meeting.id);
      if (payload.segments.length) {
        allTranscripts = payload.segments;
      }
      if (payload.refinedText) {
        docRefined = payload.refinedText;
      }
    } catch (error) {
      console.error('Failed to fetch transcripts for copying:', error);
      if (!allTranscripts.length && !(displayMode === 'refined' && docRefined?.trim())) {
        toast.error('Failed to fetch transcripts for copying');
        return;
      }
    }

    const formatTime = (seconds: number | undefined, fallbackTimestamp: string): string => {
      if (seconds === undefined) {
        return fallbackTimestamp;
      }
      const totalSecs = Math.floor(seconds);
      const mins = Math.floor(totalSecs / 60);
      const secs = totalSecs % 60;
      return `[${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}]`;
    };

    const useRefined = displayMode === 'refined';
    const hasSegmentRefined = allTranscripts.some((t) => Boolean(t.refined_text?.trim()));

    let fullTranscript: string;
    let mode: string;
    let count: number;
    let wordSource: string[];

    if (useRefined && hasSegmentRefined) {
      fullTranscript = allTranscripts
        .map((t) => {
          const time = formatTime(t.audio_start_time, t.timestamp);
          const speaker = t.speaker?.trim() ? `${t.speaker.trim()}: ` : '';
          const text = t.refined_text?.trim() || t.text;
          return `${time} ${speaker}${text}  `;
        })
        .join('\n');
      mode = 'refined';
      count = allTranscripts.length;
      wordSource = allTranscripts.map((t) => t.refined_text?.trim() || t.text);
    } else if (useRefined && docRefined?.trim()) {
      fullTranscript = docRefined.trim();
      mode = 'refined';
      count = 1;
      wordSource = [docRefined.trim()];
    } else {
      if (!allTranscripts.length) {
        toast.error('No transcripts available to copy');
        return;
      }
      fullTranscript = allTranscripts
        .map((t) => {
          const time = formatTime(t.audio_start_time, t.timestamp);
          const speaker = t.speaker?.trim() ? `${t.speaker.trim()}: ` : '';
          return `${time} ${speaker}${t.text}  `;
        })
        .join('\n');
      mode = 'raw';
      count = allTranscripts.length;
      wordSource = allTranscripts.map((t) => t.text);
    }

    await navigator.clipboard.writeText(header + date + fullTranscript);
    toast.success(mode === 'refined' ? 'Refined transcript copied to clipboard' : 'Transcript copied to clipboard');

    const wordCount = wordSource
      .map((t) => t.split(/\s+/).length)
      .reduce((a, b) => a + b, 0);

    await Analytics.trackCopy('transcript', {
      meeting_id: meeting.id,
      transcript_length: count.toString(),
      word_count: wordCount.toString(),
      mode,
    });
  }, [meeting, meetingTitle, transcripts, refinedText, displayMode]);

  // Copy summary to clipboard
  const handleCopySummary = useCallback(async () => {
    try {
      let summaryMarkdown = '';

      console.log('🔍 Copy Summary - Starting...');

      // Try to get markdown from BlockNote editor first
      if (blockNoteSummaryRef.current?.getMarkdown) {
        console.log('📝 Trying to get markdown from ref...');
        summaryMarkdown = await blockNoteSummaryRef.current.getMarkdown();
        console.log('📝 Got markdown from ref, length:', summaryMarkdown.length);
      }

      // Fallback: Check if aiSummary has markdown property
      if (!summaryMarkdown && aiSummary && 'markdown' in aiSummary) {
        console.log('📝 Using markdown from aiSummary');
        summaryMarkdown = (aiSummary as any).markdown || '';
        console.log('📝 Markdown from aiSummary, length:', summaryMarkdown.length);
      }

      // Fallback: Check for legacy format
      if (!summaryMarkdown && aiSummary) {
        console.log('📝 Converting legacy format to markdown');
        const sections = Object.entries(aiSummary)
          .filter(([key]) => {
            // Skip non-section keys
            return key !== 'markdown' && key !== 'summary_json' && key !== '_section_order' && key !== 'MeetingName';
          })
          .map(([, section]) => {
            if (section && typeof section === 'object' && 'title' in section && 'blocks' in section) {
              const sectionTitle = `## ${section.title}\n\n`;
              const sectionContent = section.blocks
                .map((block: any) => `- ${block.content}`)
                .join('\n');
              return sectionTitle + sectionContent;
            }
            return '';
          })
          .filter(s => s.trim())
          .join('\n\n');
        summaryMarkdown = sections;
        console.log('📝 Converted legacy format, length:', summaryMarkdown.length);
      }

      // If still no summary content, show message
      if (!summaryMarkdown.trim()) {
        console.error('❌ No summary content available to copy');
        toast.error('No summary content available to copy');
        return;
      }

      // Build metadata header
      const header = `# Meeting Summary: ${meetingTitle}\n\n`;
      const metadata = `**Meeting ID:** ${meeting.id}\n**Date:** ${new Date(meeting.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}\n**Copied on:** ${new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}\n\n---\n\n`;

      const fullMarkdown = header + metadata + summaryMarkdown;
      await navigator.clipboard.writeText(fullMarkdown);

      console.log('✅ Successfully copied to clipboard!');
      toast.success("Summary copied to clipboard");

      // Track copy analytics
      await Analytics.trackCopy('summary', {
        meeting_id: meeting.id,
        has_markdown: (!!aiSummary && 'markdown' in aiSummary).toString()
      });
    } catch (error) {
      console.error('❌ Failed to copy summary:', error);
      toast.error("Failed to copy summary");
    }
  }, [aiSummary, meetingTitle, meeting, blockNoteSummaryRef]);

  return {
    handleCopyTranscript,
    handleCopySummary,
  };
}

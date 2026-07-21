import { invoke } from '@tauri-apps/api/core';
import { Summary, Transcript } from '@/types';

type CommandResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

type ApiMeeting = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  folder_path?: string;
  [key: string]: any;
};

type TranscriptSegment = {
  id: number;
  start: number;
  end: number;
  text: string;
  speaker?: string;
  refined_text?: string | null;
};

type ApiSummary = {
  id: string;
  content: string;
  template?: string;
  key_points?: string[];
  action_items?: string[];
  decisions?: string[];
  status: string;
};

function normalizeTemplateId(template?: string | null): string {
  if (!template) return '';
  const t = template.trim();
  const lower = t.toLowerCase();
  if (lower === 'keypoints' || lower === 'key_points' || lower === 'key-points') return 'key_points';
  if (lower === 'actionitems' || lower === 'action_items' || lower === 'action-items') return 'action_items';
  if (lower === 'decisions') return 'decisions';
  if (lower === 'full') return 'full';
  if (lower === 'meetingnotes' || lower === 'meeting_notes' || lower === 'meeting-notes') return 'meeting_notes';
  return lower;
}

function isCompletedStatus(status?: string | null): boolean {
  return (status || '').toLowerCase() === 'completed';
}

async function unwrap<T>(promise: Promise<CommandResult<T>>, fallback: string): Promise<T> {
  const result = await promise;
  if (!result.success || result.data === undefined) {
    throw new Error(result.error || fallback);
  }
  return result.data;
}

function transcriptFromSegments(segments: TranscriptSegment[] = []): Transcript[] {
  return segments.map((segment) => ({
    id: String(segment.id),
    text: segment.text,
    timestamp: '',
    audio_start_time: segment.start,
    audio_end_time: segment.end,
    duration: segment.end - segment.start,
    speaker: segment.speaker,
    refined_text: segment.refined_text?.trim() || null,
  }));
}

export type TranscriptPayload = {
  segments: Transcript[];
  refinedText: string | null;
};

function summaryToMarkdown(summary: ApiSummary): Summary {
  return { markdown: summary.content?.trim() || '' } as any;
}

export const meetingApiService = {
  async listMeetings(): Promise<ApiMeeting[]> {
    const data = await unwrap<{ meetings?: ApiMeeting[] }>(
      invoke('list_meetings', { limit: 100, offset: 0 }),
      'Failed to load meetings'
    );
    return data.meetings || [];
  },

  async getMeeting(id: string): Promise<ApiMeeting> {
    return unwrap<ApiMeeting>(invoke('get_meeting', { id }), 'Failed to load meeting');
  },

  async getTranscript(meetingId: string): Promise<TranscriptPayload> {
    const data = await unwrap<{
      transcript?: {
        segments?: TranscriptSegment[];
        text?: string;
        duration?: number;
        refined_text?: string | null;
      };
    }>(invoke('get_transcript', { meetingId }), 'Failed to load transcript');

    const refinedText = data.transcript?.refined_text?.trim() || null;

    if (data.transcript?.segments?.length) {
      return {
        segments: transcriptFromSegments(data.transcript.segments),
        refinedText,
      };
    }

    if (data.transcript?.text) {
      return {
        segments: [{
          id: `${meetingId}-transcript`,
          text: data.transcript.text,
          timestamp: '',
          audio_start_time: 0,
          audio_end_time: data.transcript.duration,
          duration: data.transcript.duration,
        }],
        refinedText,
      };
    }

    return { segments: [], refinedText };
  },

  async generateSummary(meetingId: string, template: string, language: string | null): Promise<string> {
    const data = await unwrap<{ job_id: string }>(
      invoke('generate_summary', {
        meetingId,
        template,
        language: language || null,
      }),
      'Failed to start summary generation'
    );
    return data.job_id;
  },

  async getJobStatus(jobId: string): Promise<{ state: string; error?: string | null }> {
    return unwrap(invoke('get_job_status', { jobId }), 'Failed to fetch job status');
  },

  async getSummary(meetingId: string, template?: string | null): Promise<Summary | null> {
    const wanted = normalizeTemplateId(template);

    // Prefer per-template endpoint when a template is specified
    if (wanted) {
      try {
        const result = await invoke<CommandResult<ApiSummary | null>>('get_summary', {
          meetingId,
          template: wanted,
        });
        if (result.success) {
          const summary = result.data ?? null;
          if (summary && isCompletedStatus(summary.status) && summary.content?.trim()) {
            return summaryToMarkdown(summary);
          }
          // Missing or incomplete for this template
          if (summary === null || (summary && !isCompletedStatus(summary.status))) {
            return null;
          }
          // completed but empty content — still show empty markdown as present
          if (summary && isCompletedStatus(summary.status)) {
            return summaryToMarkdown(summary);
          }
        }
      } catch {
        // Fall through to list_summaries
      }
    }

    const data = await unwrap<{ summaries?: ApiSummary[] }>(
      invoke('list_summaries', { meetingId }),
      'Failed to load summary'
    );

    const summaries = data.summaries || [];
    if (wanted) {
      const match = summaries.find(
        (item) =>
          normalizeTemplateId(item.template) === wanted && isCompletedStatus(item.status)
      );
      return match ? summaryToMarkdown(match) : null;
    }

    const summary =
      summaries.find((item) => isCompletedStatus(item.status)) || summaries[0] || null;
    return summary ? summaryToMarkdown(summary) : null;
  },

  async updateMeeting(id: string, title: string): Promise<ApiMeeting> {
    return unwrap<ApiMeeting>(invoke('update_meeting', { id, title }), 'Failed to update meeting');
  },

  async deleteMeeting(id: string): Promise<void> {
    await unwrap<boolean>(invoke('delete_meeting', { id }), 'Failed to delete meeting');
  },

  async retranscribeMeeting(id: string): Promise<{ job_id: string }> {
    return unwrap<{ job_id: string }>(
      invoke('retranscribe_meeting', { id }),
      'Failed to start retranscription'
    );
  },
};

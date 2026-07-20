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
};

type ApiSummary = {
  id: string;
  content: string;
  key_points?: string[];
  action_items?: string[];
  decisions?: string[];
  status: string;
};

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
  }));
}

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

  async getTranscript(meetingId: string): Promise<Transcript[]> {
    const data = await unwrap<{ transcript?: { segments?: TranscriptSegment[]; text?: string; duration?: number } }>(
      invoke('get_transcript', { meetingId }),
      'Failed to load transcript'
    );

    if (data.transcript?.segments?.length) {
      return transcriptFromSegments(data.transcript.segments);
    }

    if (data.transcript?.text) {
      return [{
        id: `${meetingId}-transcript`,
        text: data.transcript.text,
        timestamp: '',
        audio_start_time: 0,
        audio_end_time: data.transcript.duration,
        duration: data.transcript.duration,
      }];
    }

    return [];
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

  async getSummary(meetingId: string): Promise<Summary | null> {
    const data = await unwrap<{ summaries?: ApiSummary[] }>(
      invoke('list_summaries', { meetingId }),
      'Failed to load summary'
    );

    const summary = data.summaries?.find((item) => item.status === 'completed') || data.summaries?.[0];
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

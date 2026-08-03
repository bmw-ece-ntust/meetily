import { invoke } from '@tauri-apps/api/core';

type CommandResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

type ApiConfig = {
  base_url: string;
  api_key?: string | null;
};

/** Build a media URL against the configured API base, attaching `?api_key=` when set. */
export async function buildMediaUrl(path: string): Promise<string> {
  const result = await invoke<CommandResult<ApiConfig>>('get_api_config');
  if (!result.success || !result.data?.base_url) {
    throw new Error(result.error || 'API not configured');
  }

  const base = result.data.base_url.replace(/\/+$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  let url = `${base}${normalized}`;

  const key = result.data.api_key;
  if (key) {
    const sep = url.includes('?') ? '&' : '?';
    url = `${url}${sep}api_key=${encodeURIComponent(key)}`;
  }

  return url;
}

export function meetingRecordingUrl(meetingId: string): Promise<string> {
  return buildMediaUrl(`/meetings/${meetingId}/recording`);
}

export function personSampleAudioUrl(personId: string, sampleId: string): Promise<string> {
  return buildMediaUrl(`/persons/${personId}/samples/${sampleId}/audio`);
}

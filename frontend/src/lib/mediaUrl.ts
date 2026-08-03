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

/**
 * Build a media URL for browser playback.
 *
 * In production the webview origin is `tauri://localhost` (or
 * `http://tauri.localhost` on Windows), so plain `http://` media URLs are
 * blocked as mixed content. Route through the Rust-side `media://` proxy,
 * which forwards the request (with auth + Range headers) to the API server.
 * In dev the page is plain http, so stream the API URL directly.
 */
export async function buildMediaUrl(path: string): Promise<string> {
  const normalized = path.startsWith('/') ? path : `/${path}`;

  if (window.location.protocol === 'tauri:') {
    return `media://localhost${normalized}`;
  }
  if (window.location.hostname === 'tauri.localhost') {
    return `http://media.localhost${normalized}`;
  }

  const result = await invoke<CommandResult<ApiConfig>>('get_api_config');
  if (!result.success || !result.data?.base_url) {
    throw new Error(result.error || 'API not configured');
  }

  const base = result.data.base_url.replace(/\/+$/, '');
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

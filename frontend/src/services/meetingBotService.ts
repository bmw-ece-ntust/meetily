import { invoke } from '@tauri-apps/api/core';

type CommandResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type BotJobStatus =
  | 'queued'
  | 'joining'
  | 'in_call'
  | 'recording'
  | 'uploading'
  | 'completed'
  | 'failed';

export type BotJob = {
  id: string;
  platform: string;
  status: BotJobStatus | string;
  meeting_url?: string | null;
  native_meeting_id?: string | null;
  bot_name?: string | null;
  title?: string | null;
  recording_path?: string | null;
  meeting_agent_job_id?: string | null;
  error?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type CreateBotResponse = {
  job_id?: string;
  id?: string;
  platform?: string;
  status?: string;
};

export type PlatformInfo = {
  id: string;
  status: string;
};

async function unwrap<T>(promise: Promise<CommandResult<T>>, fallback: string): Promise<T> {
  const result = await promise;
  if (!result.success || result.data === undefined) {
    throw new Error(result.error || fallback);
  }
  return result.data;
}

function botIdFromCreate(res: CreateBotResponse): string {
  const id = res.job_id || res.id;
  if (!id) throw new Error('Bot create response missing id');
  return id;
}

export const meetingBotService = {
  async listPlatforms(): Promise<PlatformInfo[]> {
    const data = await unwrap<{ platforms?: PlatformInfo[] }>(
      invoke('list_bot_platforms'),
      'Failed to list bot platforms (is meeting-bot enabled on the server?)'
    );
    return data.platforms || [];
  },

  async listBots(limit = 20, status?: string): Promise<BotJob[]> {
    const data = await unwrap<{ bots?: BotJob[] }>(
      invoke('list_bots', { limit, status: status ?? null }),
      'Failed to list bots'
    );
    return data.bots || [];
  },

  async getBot(id: string): Promise<BotJob> {
    return unwrap(invoke('get_bot', { id }), 'Failed to get bot status');
  },

  async createBot(params: {
    platform?: string;
    meetingUrl: string;
    title?: string;
    botName?: string;
  }): Promise<{ botId: string; status?: string }> {
    const res = await unwrap<CreateBotResponse>(
      invoke('create_bot', {
        platform: params.platform || 'teams',
        meetingUrl: params.meetingUrl,
        nativeMeetingId: null,
        botName: params.botName ?? null,
        title: params.title ?? null,
      }),
      'Failed to start bot'
    );
    return { botId: botIdFromCreate(res), status: res.status };
  },

  async stopBot(id: string): Promise<BotJob> {
    return unwrap(invoke('delete_bot', { id }), 'Failed to stop bot');
  },

  isTerminal(status: string): boolean {
    return status === 'completed' || status === 'failed';
  },
};

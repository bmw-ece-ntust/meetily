'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { meetingApiService } from '@/services/meetingApiService';
import { meetingBotService } from '@/services/meetingBotService';

export type BackgroundJobType = 'summary' | 'retranscribe' | 'import' | 'identify' | 'bot';
export type BackgroundJobState =
  | 'queued'
  | 'starting'
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface BackgroundJob {
  id: string;
  jobId?: string;
  /** Live meeting-bot job id (agent GET /bots/:id). */
  botId?: string;
  type: BackgroundJobType;
  meetingId: string;
  meetingTitle?: string;
  state: BackgroundJobState;
  error?: string;
  progress?: number;
  message?: string;
  template?: string;
  language?: string | null;
  sourcePath?: string;
  createdAt: number;
}

export interface EnqueueSummaryOptions {
  meetingId: string;
  template: string;
  language?: string | null;
  meetingTitle?: string;
  isRegeneration?: boolean;
  onComplete?: (meetingId: string) => void | Promise<void>;
  onError?: (error: string) => void;
}

export interface EnqueueRetranscribeOptions {
  meetingId: string;
  meetingTitle?: string;
  onComplete?: (meetingId: string) => void | Promise<void>;
  onError?: (error: string) => void;
}

export interface EnqueueImportOptions {
  sourcePath: string;
  title: string;
  language?: string | null;
  model?: string | null;
  provider?: string | null;
  onComplete?: (meetingId: string, result?: ImportJobResult) => void | Promise<void>;
  onError?: (error: string) => void;
}

export interface EnqueueBotOptions {
  meetingUrl: string;
  platform?: string;
  title?: string;
  botName?: string;
  onComplete?: (meetingId: string, result?: ImportJobResult) => void | Promise<void>;
  onError?: (error: string) => void;
}

export interface ImportJobResult {
  meeting_id: string;
  title: string;
  segments_count: number;
  duration_seconds: number;
}

type JobCallbacks = {
  onComplete?: (meetingId: string, result?: ImportJobResult) => void | Promise<void>;
  onError?: (error: string) => void;
};

interface JobQueueContextType {
  jobs: BackgroundJob[];
  activeCount: number;
  queuedCount: number;
  maxConcurrent: number;
  enqueueSummary: (options: EnqueueSummaryOptions) => string;
  enqueueRetranscribe: (options: EnqueueRetranscribeOptions) => string;
  enqueueImport: (options: EnqueueImportOptions) => string;
  /** Start Teams (etc.) bot via agent; tracks in background (can close dialog). */
  enqueueBot: (options: EnqueueBotOptions) => string;
  trackJob: (params: {
    jobId: string;
    type: BackgroundJobType;
    meetingId: string;
    meetingTitle?: string;
    onComplete?: (meetingId: string) => void | Promise<void>;
    onError?: (error: string) => void;
  }) => string;
  cancelLocal: (localId: string) => void;
  dismissJob: (localId: string) => void;
  isMeetingBusy: (meetingId: string, type?: BackgroundJobType) => boolean;
  getJobsForMeeting: (meetingId: string) => BackgroundJob[];
}

const MAX_CONCURRENT = 3;
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 200;

const JobQueueContext = createContext<JobQueueContextType | null>(null);

export function useJobQueue() {
  const context = useContext(JobQueueContext);
  if (!context) {
    throw new Error('useJobQueue must be used within a JobQueueProvider');
  }
  return context;
}

/** Optional hook — returns null outside provider (for components that may render early). */
export function useJobQueueOptional() {
  return useContext(JobQueueContext);
}

function makeLocalId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function jobLabel(type: BackgroundJobType): string {
  switch (type) {
    case 'summary':
      return 'Summary';
    case 'retranscribe':
      return 'Retranscribe';
    case 'import':
      return 'Import';
    case 'identify':
      return 'Identify speakers';
    case 'bot':
      return 'Meeting bot';
  }
}

const BOT_STATUS_MESSAGE: Record<string, string> = {
  queued: 'Bot queued…',
  joining: 'Joining Teams (admit in lobby if needed)…',
  in_call: 'In call…',
  recording: 'Recording…',
  uploading: 'Uploading recording…',
  completed: 'Bot finished',
  failed: 'Bot failed',
  transcribing: 'Transcribing recording…',
};

/** Local job is a live-bot pipeline (join → record → import on same row). */
function isBotPipeline(job: BackgroundJob): boolean {
  return job.type === 'bot' || Boolean(job.botId);
}

function normalizeState(raw: string | undefined): BackgroundJobState {
  const state = (raw || '').toLowerCase();
  if (state === 'completed') return 'completed';
  if (state === 'failed') return 'failed';
  if (state === 'cancelled') return 'cancelled';
  if (state === 'processing') return 'processing';
  if (state === 'pending') return 'pending';
  return 'processing';
}

function isTerminal(state: BackgroundJobState): boolean {
  return state === 'completed' || state === 'failed' || state === 'cancelled';
}

function isActiveState(state: BackgroundJobState): boolean {
  return state === 'starting' || state === 'pending' || state === 'processing';
}

export function JobQueueProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);
  const jobsRef = useRef<BackgroundJob[]>([]);
  const callbacksRef = useRef<Map<string, JobCallbacks>>(new Map());
  const pollTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pollCountsRef = useRef<Map<string, number>>(new Map());
  const startingRef = useRef<Set<string>>(new Set());
  const pumpRef = useRef<() => void>(() => {});

  const setJobsBoth = useCallback((updater: (prev: BackgroundJob[]) => BackgroundJob[]) => {
    setJobs((prev) => {
      const next = updater(prev);
      jobsRef.current = next;
      return next;
    });
  }, []);

  const updateJob = useCallback(
    (localId: string, patch: Partial<BackgroundJob>) => {
      setJobsBoth((prev) =>
        prev.map((job) => (job.id === localId ? { ...job, ...patch } : job))
      );
    },
    [setJobsBoth]
  );

  const clearPoll = useCallback((localId: string) => {
    const timer = pollTimersRef.current.get(localId);
    if (timer) {
      clearTimeout(timer);
      pollTimersRef.current.delete(localId);
    }
    pollCountsRef.current.delete(localId);
  }, []);

  const finishJob = useCallback(
    async (
      localId: string,
      state: BackgroundJobState,
      error?: string,
      importResult?: ImportJobResult
    ) => {
      clearPoll(localId);
      startingRef.current.delete(localId);

      const job = jobsRef.current.find((j) => j.id === localId);
      if (!job) return;

      const meetingId = importResult?.meeting_id || job.meetingId;
      updateJob(localId, {
        state,
        error,
        message: error,
        meetingId,
        meetingTitle: importResult?.title || job.meetingTitle,
        progress: state === 'completed' ? 100 : job.progress,
      });

      const callbacks = callbacksRef.current.get(localId);
      callbacksRef.current.delete(localId);

      if (state === 'completed') {
        toast.success(`${jobLabel(job.type)} complete`, {
          description: importResult?.title || job.meetingTitle || meetingId,
        });
        try {
          await callbacks?.onComplete?.(meetingId, importResult);
        } catch (e) {
          console.error('[JobQueue] onComplete error:', e);
        }
      } else if (state === 'failed') {
        const msg = error || `${jobLabel(job.type)} failed`;
        toast.error(`${jobLabel(job.type)} failed`, { description: msg });
        callbacks?.onError?.(msg);
      } else if (state === 'cancelled') {
        toast.info(`${jobLabel(job.type)} cancelled`);
      }

      // Keep terminal jobs visible longer so the tray doesn't look "empty" immediately
      setTimeout(() => {
        setJobsBoth((prev) => prev.filter((j) => j.id !== localId));
      }, state === 'completed' ? 8000 : 20_000);

      pumpRef.current();
    },
    [clearPoll, setJobsBoth, updateJob]
  );

  const pollJob = useCallback(
    async (localId: string) => {
      const job = jobsRef.current.find((j) => j.id === localId);
      if (!job?.jobId || isTerminal(job.state)) return;

      const count = (pollCountsRef.current.get(localId) || 0) + 1;
      pollCountsRef.current.set(localId, count);

      if (count > MAX_POLLS) {
        await finishJob(localId, 'failed', `${jobLabel(job.type)} timed out`);
        return;
      }

      try {
        const status = await meetingApiService.getJobStatus(job.jobId);
        const state = normalizeState(status.state);
        const fromBot = isBotPipeline(job);

        if (isTerminal(state)) {
          if (state === 'completed') {
            if (!status.meeting_id && count < 10) {
              updateJob(localId, {
                // keep type bot for live pipeline UX
                type: fromBot ? 'bot' : job.type,
                state: 'processing',
                message: 'Waiting for meeting id…',
                progress: 95,
              });
              const timer = setTimeout(() => {
                void pollJob(localId);
              }, POLL_INTERVAL_MS);
              pollTimersRef.current.set(localId, timer);
              return;
            }
            const meetingId =
              status.meeting_id ||
              (job.meetingId.startsWith('bot-pending') || job.meetingId.startsWith('import-pending')
                ? ''
                : job.meetingId);
            if (!meetingId) {
              await finishJob(
                localId,
                'failed',
                'Import completed but meeting id missing — check server jobs'
              );
              return;
            }
            await finishJob(localId, 'completed', undefined, {
              meeting_id: meetingId,
              title: job.meetingTitle || 'Meeting',
              segments_count: 0,
              duration_seconds: 0,
            });
          } else if (state === 'cancelled') {
            await finishJob(localId, 'cancelled');
          } else {
            await finishJob(localId, 'failed', status.error || `${jobLabel(job.type)} failed`);
          }
          return;
        }

        updateJob(localId, {
          type: fromBot ? 'bot' : job.type,
          state,
          error: status.error || undefined,
          message: fromBot
            ? BOT_STATUS_MESSAGE.transcribing
            : state === 'pending'
              ? 'Waiting on server...'
              : `${jobLabel(job.type)} in progress...`,
          progress: fromBot ? Math.max(job.progress ?? 88, 90) : job.progress,
        });

        const timer = setTimeout(() => {
          void pollJob(localId);
        }, POLL_INTERVAL_MS);
        pollTimersRef.current.set(localId, timer);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (count < 5) {
          const timer = setTimeout(() => {
            void pollJob(localId);
          }, POLL_INTERVAL_MS);
          pollTimersRef.current.set(localId, timer);
          return;
        }
        await finishJob(localId, 'failed', message);
      }
    },
    [finishJob, updateJob]
  );

  const startQueuedJob = useCallback(
    async (localId: string) => {
      if (startingRef.current.has(localId)) return;
      const job = jobsRef.current.find((j) => j.id === localId);
      if (!job || job.state !== 'queued') return;

      startingRef.current.add(localId);
      updateJob(localId, { state: 'starting', message: 'Starting...' });

      try {
        if (job.type === 'summary') {
          const jobId = await meetingApiService.generateSummary(
            job.meetingId,
            job.template || 'full',
            job.language ?? null
          );
          updateJob(localId, {
            jobId,
            state: 'processing',
            message: 'Generating summary...',
          });
          toast.info('Generating summary...', {
            description: job.meetingTitle || job.meetingId,
          });
          void pollJob(localId);
        } else if (job.type === 'retranscribe') {
          const { job_id } = await meetingApiService.retranscribeMeeting(job.meetingId);
          updateJob(localId, {
            jobId: job_id,
            state: 'processing',
            message: 'Retranscribing...',
          });
          toast.info('Retranscription started', {
            description: job.meetingTitle || job.meetingId,
          });
          void pollJob(localId);
        } else if (job.type === 'import') {
          if (!job.sourcePath) {
            await finishJob(localId, 'failed', 'Missing import source path');
            return;
          }
          const { invoke } = await import('@tauri-apps/api/core');
          const started = await invoke<{ job_id: string; message: string }>(
            'start_import_audio_command',
            {
              sourcePath: job.sourcePath,
              title: job.meetingTitle || 'Imported Meeting',
              language: job.language ?? null,
              model: null,
              provider: null,
            }
          );
          updateJob(localId, {
            jobId: started.job_id,
            state: 'processing',
            message: 'Importing audio...',
          });
          toast.info('Import started', {
            description: job.meetingTitle || job.sourcePath,
          });
          // Progress/completion via Tauri import-* events (no local poll needed)
        } else {
          await finishJob(localId, 'failed', `Unknown job type: ${job.type}`);
          return;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await finishJob(localId, 'failed', message);
        return;
      } finally {
        startingRef.current.delete(localId);
      }
    },
    [finishJob, pollJob, updateJob]
  );

  const pump = useCallback(() => {
    const current = jobsRef.current;
    const active = current.filter((j) => isActiveState(j.state)).length;
    const slots = MAX_CONCURRENT - active;
    if (slots <= 0) return;

    const queued = current
      .filter((j) => j.state === 'queued')
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, slots);

    for (const job of queued) {
      void startQueuedJob(job.id);
    }
  }, [startQueuedJob]);

  useEffect(() => {
    pumpRef.current = pump;
  }, [pump]);

  const enqueueSummary = useCallback(
    (options: EnqueueSummaryOptions): string => {
      const existing = jobsRef.current.find(
        (j) =>
          j.meetingId === options.meetingId &&
          j.type === 'summary' &&
          !isTerminal(j.state)
      );
      if (existing) {
        toast.info('Summary already in progress for this meeting');
        return existing.id;
      }

      const id = makeLocalId();
      callbacksRef.current.set(id, {
        onComplete: options.onComplete,
        onError: options.onError,
      });

      const job: BackgroundJob = {
        id,
        type: 'summary',
        meetingId: options.meetingId,
        meetingTitle: options.meetingTitle,
        state: 'queued',
        template: options.template,
        language: options.language ?? null,
        message: 'Queued...',
        createdAt: Date.now(),
      };

      setJobsBoth((prev) => [...prev, job]);
      toast.info(
        options.isRegeneration ? 'Summary regeneration queued' : 'Summary queued',
        {
          description:
            jobsRef.current.filter((j) => isActiveState(j.state)).length >= MAX_CONCURRENT
              ? `Waiting — max ${MAX_CONCURRENT} concurrent jobs`
              : options.meetingTitle || options.meetingId,
        }
      );

      // Defer pump so jobsRef includes the new job
      queueMicrotask(() => pumpRef.current());
      return id;
    },
    [setJobsBoth]
  );

  const enqueueRetranscribe = useCallback(
    (options: EnqueueRetranscribeOptions): string => {
      const existing = jobsRef.current.find(
        (j) =>
          j.meetingId === options.meetingId &&
          j.type === 'retranscribe' &&
          !isTerminal(j.state)
      );
      if (existing) {
        toast.info('Retranscription already in progress for this meeting');
        return existing.id;
      }

      const id = makeLocalId();
      callbacksRef.current.set(id, {
        onComplete: options.onComplete,
        onError: options.onError,
      });

      const job: BackgroundJob = {
        id,
        type: 'retranscribe',
        meetingId: options.meetingId,
        meetingTitle: options.meetingTitle,
        state: 'queued',
        message: 'Queued...',
        createdAt: Date.now(),
      };

      setJobsBoth((prev) => [...prev, job]);
      queueMicrotask(() => pumpRef.current());
      return id;
    },
    [setJobsBoth]
  );

  const enqueueImport = useCallback(
    (options: EnqueueImportOptions): string => {
      const existing = jobsRef.current.find(
        (j) =>
          j.type === 'import' &&
          j.sourcePath === options.sourcePath &&
          !isTerminal(j.state)
      );
      if (existing) {
        toast.info('This file is already queued or importing');
        return existing.id;
      }

      const id = makeLocalId();
      callbacksRef.current.set(id, {
        onComplete: options.onComplete,
        onError: options.onError,
      });

      const job: BackgroundJob = {
        id,
        type: 'import',
        meetingId: `import-pending-${id}`,
        meetingTitle: options.title,
        sourcePath: options.sourcePath,
        language: options.language ?? null,
        state: 'queued',
        message: 'Queued...',
        createdAt: Date.now(),
      };

      setJobsBoth((prev) => [...prev, job]);
      const active = jobsRef.current.filter((j) => isActiveState(j.state)).length;
      toast.info('Import queued', {
        description:
          active >= MAX_CONCURRENT
            ? `Waiting — max ${MAX_CONCURRENT} concurrent jobs`
            : options.title,
      });
      queueMicrotask(() => pumpRef.current());
      return id;
    },
    [setJobsBoth]
  );

  const pollBotJob = useCallback(
    async (localId: string) => {
      const job = jobsRef.current.find((j) => j.id === localId);
      // Keep type 'bot' for the whole pipeline (join → import); only need botId
      if (!job?.botId || !isBotPipeline(job) || isTerminal(job.state)) return;

      // Already handed off to agent import job — poll that, not bot status
      if (job.jobId) {
        void pollJob(localId);
        return;
      }

      const count = (pollCountsRef.current.get(localId) || 0) + 1;
      pollCountsRef.current.set(localId, count);
      if (count > MAX_POLLS) {
        await finishJob(localId, 'failed', 'Meeting bot timed out');
        return;
      }

      try {
        const bot = await meetingBotService.getBot(job.botId);
        const status = (bot.status || '').toLowerCase();
        const message = BOT_STATUS_MESSAGE[status] || status;

        // Prefer import id even on failed bot (partial upload)
        const importJobId = bot.meeting_agent_job_id;

        if (status === 'failed' && !importJobId) {
          await finishJob(localId, 'failed', bot.error || 'Meeting bot failed');
          return;
        }

        if (status === 'completed' || (status === 'failed' && importJobId)) {
          if (!importJobId) {
            if (count < 15) {
              updateJob(localId, {
                type: 'bot',
                state: 'processing',
                message: 'Waiting for import job id…',
                progress: 85,
                meetingTitle: bot.title || job.meetingTitle,
              });
              const timer = setTimeout(() => {
                void pollBotJob(localId);
              }, POLL_INTERVAL_MS);
              pollTimersRef.current.set(localId, timer);
              return;
            }
            await finishJob(
              localId,
              'failed',
              bot.error ||
                'Bot finished but no import job was created (check meeting-bot logs for [import])'
            );
            return;
          }

          // Same local row: stay type bot, add import jobId, then poll agent jobs.
          // Drop any orphan import row that events may have created for the same jobId.
          setJobsBoth((prev) =>
            prev
              .filter(
                (j) =>
                  !(
                    j.id !== localId &&
                    j.jobId === importJobId &&
                    !isTerminal(j.state)
                  )
              )
              .map((j) =>
                j.id === localId
                  ? {
                      ...j,
                      type: 'bot' as const,
                      jobId: importJobId,
                      botId: job.botId,
                      state: 'processing' as const,
                      message: BOT_STATUS_MESSAGE.transcribing,
                      progress: 88,
                      meetingTitle: bot.title || job.meetingTitle,
                    }
                  : j
              )
          );
          clearPoll(localId);
          pollCountsRef.current.set(localId, 0);
          void pollJob(localId);
          return;
        }

        // Still running (joining / in_call / recording / uploading)
        const progressMap: Record<string, number> = {
          queued: 5,
          joining: 15,
          in_call: 35,
          recording: 55,
          uploading: 80,
        };
        updateJob(localId, {
          type: 'bot',
          state: 'processing',
          message,
          progress: progressMap[status] ?? 40,
          meetingTitle: bot.title || job.meetingTitle,
        });

        const timer = setTimeout(() => {
          void pollBotJob(localId);
        }, POLL_INTERVAL_MS);
        pollTimersRef.current.set(localId, timer);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (count < 5) {
          const timer = setTimeout(() => {
            void pollBotJob(localId);
          }, POLL_INTERVAL_MS);
          pollTimersRef.current.set(localId, timer);
          return;
        }
        await finishJob(localId, 'failed', msg);
      }
    },
    [clearPoll, finishJob, pollJob, setJobsBoth, updateJob]
  );

  const enqueueBot = useCallback(
    (options: EnqueueBotOptions): string => {
      const id = makeLocalId();
      callbacksRef.current.set(id, {
        onComplete: options.onComplete,
        onError: options.onError,
      });

      const title = options.title?.trim() || 'Teams meeting';
      const job: BackgroundJob = {
        id,
        type: 'bot',
        meetingId: `bot-pending-${id}`,
        meetingTitle: title,
        state: 'starting',
        message: 'Starting bot…',
        createdAt: Date.now(),
      };
      setJobsBoth((prev) => [...prev, job]);

      toast.info('Meeting bot starting', {
        description: 'You can close this dialog — progress is in the job list.',
      });

      void (async () => {
        try {
          const { botId } = await meetingBotService.createBot({
            platform: options.platform || 'teams',
            meetingUrl: options.meetingUrl,
            title: options.title,
            botName: options.botName,
          });
          updateJob(id, {
            botId,
            state: 'processing',
            message: BOT_STATUS_MESSAGE.joining,
            progress: 10,
          });
          void pollBotJob(id);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await finishJob(id, 'failed', msg);
        }
      })();

      return id;
    },
    [finishJob, pollBotJob, setJobsBoth, updateJob]
  );

  const trackJob = useCallback(
    (params: {
      jobId: string;
      type: BackgroundJobType;
      meetingId: string;
      meetingTitle?: string;
      onComplete?: (meetingId: string) => void | Promise<void>;
      onError?: (error: string) => void;
    }): string => {
      const existing = jobsRef.current.find(
        (j) => j.jobId === params.jobId || (
          j.meetingId === params.meetingId &&
          j.type === params.type &&
          !isTerminal(j.state)
        )
      );
      if (existing) {
        if (!existing.jobId) {
          updateJob(existing.id, { jobId: params.jobId, state: 'processing' });
          void pollJob(existing.id);
        }
        return existing.id;
      }

      const id = makeLocalId();
      callbacksRef.current.set(id, {
        onComplete: params.onComplete,
        onError: params.onError,
      });

      const job: BackgroundJob = {
        id,
        jobId: params.jobId,
        type: params.type,
        meetingId: params.meetingId,
        meetingTitle: params.meetingTitle,
        state: 'processing',
        message: `${jobLabel(params.type)} in progress...`,
        createdAt: Date.now(),
      };

      setJobsBoth((prev) => [...prev, job]);
      void pollJob(id);
      return id;
    },
    [pollJob, setJobsBoth, updateJob]
  );

  const cancelLocal = useCallback(
    (localId: string) => {
      const job = jobsRef.current.find((j) => j.id === localId);
      if (!job) return;

      if (job.state === 'queued') {
        clearPoll(localId);
        callbacksRef.current.delete(localId);
        setJobsBoth((prev) => prev.filter((j) => j.id !== localId));
        toast.info(`${jobLabel(job.type)} removed from queue`);
        pumpRef.current();
        return;
      }

      if (job.type === 'import' && job.jobId) {
        clearPoll(localId);
        void import('@tauri-apps/api/core')
          .then(({ invoke }) => invoke('cancel_import_command', { jobId: job.jobId }))
          .catch((err) => console.warn('[JobQueue] cancel import failed:', err));
        void finishJob(localId, 'cancelled');
        return;
      }

      // Bot pipeline (still joining/recording, or already transcribing)
      if (isBotPipeline(job) && job.botId && !job.jobId) {
        updateJob(localId, {
          type: 'bot',
          state: 'processing',
          message: 'Stopping bot…',
          progress: job.progress,
        });
        toast.info('Stopping meeting bot…');
        void meetingBotService
          .stopBot(job.botId)
          .catch((err) => console.warn('[JobQueue] stop bot failed:', err));
        if (!pollTimersRef.current.has(localId)) {
          void pollBotJob(localId);
        }
        return;
      }

      // Transcribing phase of bot pipeline: cancel import job if possible
      if (isBotPipeline(job) && job.jobId) {
        clearPoll(localId);
        void import('@tauri-apps/api/core')
          .then(({ invoke }) => invoke('cancel_job', { jobId: job.jobId }))
          .catch(() => {
            void import('@tauri-apps/api/core')
              .then(({ invoke }) => invoke('cancel_import_command', { jobId: job.jobId }))
              .catch((err) => console.warn('[JobQueue] cancel import failed:', err));
          });
        void finishJob(localId, 'cancelled');
        return;
      }

      clearPoll(localId);
      void finishJob(localId, 'cancelled');
    },
    [clearPoll, finishJob, pollBotJob, setJobsBoth, updateJob]
  );

  const dismissJob = useCallback(
    (localId: string) => {
      clearPoll(localId);
      callbacksRef.current.delete(localId);
      setJobsBoth((prev) => prev.filter((j) => j.id !== localId));
    },
    [clearPoll, setJobsBoth]
  );

  const isMeetingBusy = useCallback((meetingId: string, type?: BackgroundJobType) => {
    return jobsRef.current.some(
      (j) =>
        j.meetingId === meetingId &&
        !isTerminal(j.state) &&
        (type === undefined || j.type === type)
    );
  }, []);

  const getJobsForMeeting = useCallback((meetingId: string) => {
    return jobsRef.current.filter((j) => j.meetingId === meetingId);
  }, []);

  // Listen for desktop-side job + import events
  useEffect(() => {
    let unlistenProgress: (() => void) | undefined;
    let unlistenCompleted: (() => void) | undefined;
    let unlistenImportProgress: (() => void) | undefined;
    let unlistenImportComplete: (() => void) | undefined;
    let unlistenImportError: (() => void) | undefined;
    let cleanedUp = false;

    const setup = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');

        unlistenProgress = await listen<{
          job_id?: string;
          job_type?: string;
          state?: string;
          meeting_id?: string;
          progress?: Array<{ percent?: number; message?: string; stage?: string }>;
          error?: string;
        }>('job-progress', (event) => {
          const payload = event.payload;
          if (!payload?.job_id) return;

          const existing = jobsRef.current.find((j) => j.jobId === payload.job_id);
          const lastProgress = payload.progress?.[payload.progress.length - 1];
          const type = (payload.job_type?.toLowerCase() || 'import') as BackgroundJobType;
          const state = normalizeState(payload.state);

          if (existing) {
            // Keep bot pipeline rows as type bot through transcription
            updateJob(existing.id, {
              type: isBotPipeline(existing) ? 'bot' : existing.type,
              state: isTerminal(state) ? existing.state : state,
              progress: lastProgress?.percent ?? existing.progress,
              message:
                isBotPipeline(existing) && type === 'import'
                  ? lastProgress?.message || BOT_STATUS_MESSAGE.transcribing
                  : lastProgress?.message || lastProgress?.stage,
            });
            return;
          }

          // Attach to in-flight bot row that has not received jobId yet (avoid dual rows)
          const openBot = jobsRef.current.find(
            (j) => isBotPipeline(j) && !j.jobId && !isTerminal(j.state)
          );
          if (openBot && (type === 'import' || !payload.job_type) && !isTerminal(state)) {
            updateJob(openBot.id, {
              type: 'bot',
              jobId: payload.job_id,
              state: 'processing',
              progress: lastProgress?.percent ?? 88,
              message: lastProgress?.message || BOT_STATUS_MESSAGE.transcribing,
              meetingId: payload.meeting_id || openBot.meetingId,
            });
            pollCountsRef.current.set(openBot.id, 0);
            void pollJob(openBot.id);
            return;
          }

          if (!isTerminal(state) && payload.meeting_id) {
            const id = makeLocalId();
            setJobsBoth((prev) => [
              ...prev,
              {
                id,
                jobId: payload.job_id,
                type: ['summary', 'retranscribe', 'import'].includes(type) ? type : 'import',
                meetingId: payload.meeting_id!,
                state: state === 'queued' ? 'processing' : state,
                progress: lastProgress?.percent,
                message: lastProgress?.message || 'Processing...',
                createdAt: Date.now(),
              },
            ]);
          }
        });

        if (cleanedUp) {
          unlistenProgress?.();
          return;
        }

        unlistenCompleted = await listen<{
          job_id?: string;
          job_type?: string;
          state?: string;
          meeting_id?: string;
          error?: string;
        }>('job-completed', (event) => {
          const payload = event.payload;
          if (!payload?.job_id) return;

          const existing = jobsRef.current.find((j) => j.jobId === payload.job_id);
          if (!existing || isTerminal(existing.state)) return;

          const state = normalizeState(payload.state);
          if (state === 'completed') {
            void finishJob(existing.id, 'completed');
          } else if (state === 'cancelled') {
            void finishJob(existing.id, 'cancelled');
          } else {
            void finishJob(existing.id, 'failed', payload.error || 'Job failed');
          }
        });

        unlistenImportProgress = await listen<{
          job_id?: string;
          stage?: string;
          progress_percentage?: number;
          message?: string;
        }>('import-progress', (event) => {
          const payload = event.payload;
          if (!payload?.job_id) return;
          const existing = jobsRef.current.find((j) => j.jobId === payload.job_id);
          if (!existing || isTerminal(existing.state)) return;
          updateJob(existing.id, {
            type: isBotPipeline(existing) ? 'bot' : existing.type,
            state: 'processing',
            progress: payload.progress_percentage ?? existing.progress,
            message: isBotPipeline(existing)
              ? payload.message || BOT_STATUS_MESSAGE.transcribing
              : payload.message || payload.stage || 'Importing...',
          });
        });

        unlistenImportComplete = await listen<{
          job_id?: string;
          meeting_id?: string;
          title?: string;
          segments_count?: number;
          duration_seconds?: number;
        }>('import-complete', (event) => {
          const payload = event.payload;
          if (!payload?.job_id) return;
          const existing = jobsRef.current.find((j) => j.jobId === payload.job_id);
          if (!existing || isTerminal(existing.state)) return;
          void finishJob(existing.id, 'completed', undefined, {
            meeting_id: payload.meeting_id || existing.meetingId,
            title: payload.title || existing.meetingTitle || 'Imported Meeting',
            segments_count: payload.segments_count ?? 0,
            duration_seconds: payload.duration_seconds ?? 0,
          });
        });

        unlistenImportError = await listen<{
          job_id?: string | null;
          error?: string;
        }>('import-error', (event) => {
          const payload = event.payload;
          const existing = payload?.job_id
            ? jobsRef.current.find((j) => j.jobId === payload.job_id)
            : jobsRef.current.find(
                (j) => j.type === 'import' && isActiveState(j.state)
              );
          if (!existing || isTerminal(existing.state)) return;
          const msg = payload?.error || 'Import failed';
          if (msg.toLowerCase().includes('cancel')) {
            void finishJob(existing.id, 'cancelled');
          } else {
            void finishJob(existing.id, 'failed', msg);
          }
        });
      } catch {
        // Not in Tauri / events unavailable — web path uses polling only
      }
    };

    void setup();

    return () => {
      cleanedUp = true;
      unlistenProgress?.();
      unlistenCompleted?.();
      unlistenImportProgress?.();
      unlistenImportComplete?.();
      unlistenImportError?.();
    };
  }, [finishJob, pollJob, setJobsBoth, updateJob]);

  // Cleanup all polls on unmount
  useEffect(() => {
    return () => {
      pollTimersRef.current.forEach((timer) => clearTimeout(timer));
      pollTimersRef.current.clear();
    };
  }, []);

  // Discover server-spawned identify jobs (spawned after import/retranscribe) and track them.
  // Rehydrate only live bots (queued→uploading). Never rehydrate completed/failed bots —
  // that recreated stuck "Transcribing…" rows after import already finished.
  useEffect(() => {
    let cancelled = false;

    const ACTIVE_BOT = new Set([
      'queued',
      'joining',
      'in_call',
      'recording',
      'uploading',
    ]);

    const discoverBots = async () => {
      if (cancelled) return;
      try {
        // Avoid racing a local enqueueBot that has not received botId yet
        if (
          jobsRef.current.some(
            (j) => j.type === 'bot' && j.state === 'starting' && !j.botId
          )
        ) {
          return;
        }

        const bots = await meetingBotService.listBots(30);
        if (cancelled) return;

        const live = bots.filter((b) =>
          ACTIVE_BOT.has((b.status || '').toLowerCase())
        );
        const liveIds = new Set(live.map((b) => b.id));

        // Clear tray rows for dead bots (not live, no in-flight import)
        for (const j of [...jobsRef.current]) {
          if (!isBotPipeline(j) || isTerminal(j.state)) continue;
          if (j.botId && liveIds.has(j.botId)) continue;

          // Still joining/recording locally but server says bot is gone
          if (!j.jobId) {
            clearPoll(j.id);
            callbacksRef.current.delete(j.id);
            setJobsBoth((prev) => prev.filter((x) => x.id !== j.id));
            continue;
          }

          // Transcribing phase: resolve or drop if import already finished/missing
          try {
            const status = await meetingApiService.getJobStatus(j.jobId);
            if (cancelled) return;
            const st = normalizeState(status.state);
            if (st === 'completed' && status.meeting_id) {
              void finishJob(j.id, 'completed', undefined, {
                meeting_id: status.meeting_id,
                title: j.meetingTitle || 'Meeting',
                segments_count: 0,
                duration_seconds: 0,
              });
            } else if (st === 'cancelled') {
              void finishJob(j.id, 'cancelled');
            } else if (st === 'failed') {
              void finishJob(j.id, 'failed', status.error || 'Import failed');
            } else if (isTerminal(st)) {
              clearPoll(j.id);
              callbacksRef.current.delete(j.id);
              setJobsBoth((prev) => prev.filter((x) => x.id !== j.id));
            }
            // else still pending/processing — keep row + poll
          } catch {
            clearPoll(j.id);
            callbacksRef.current.delete(j.id);
            setJobsBoth((prev) => prev.filter((x) => x.id !== j.id));
          }
        }

        for (const bot of live) {
          const st = (bot.status || '').toLowerCase();
          const already = jobsRef.current.some(
            (j) => j.botId === bot.id && !isTerminal(j.state)
          );
          if (already) continue;

          const id = makeLocalId();
          const title = bot.title || 'Teams meeting';
          setJobsBoth((prev) => [
            ...prev,
            {
              id,
              type: 'bot',
              botId: bot.id,
              meetingId: `bot-pending-${bot.id}`,
              meetingTitle: title,
              state: 'processing',
              message: BOT_STATUS_MESSAGE[st] || st,
              progress:
                ({ queued: 5, joining: 15, in_call: 35, recording: 55, uploading: 80 } as Record<
                  string,
                  number
                >)[st] ?? 40,
              createdAt: Date.now(),
            },
          ]);
          void pollBotJob(id);
        }

        // Rehydrate completed bot → import only if import is still non-terminal
        for (const bot of bots) {
          const st = (bot.status || '').toLowerCase();
          if (st !== 'completed' || !bot.meeting_agent_job_id) continue;
          const already = jobsRef.current.some(
            (j) =>
              (j.botId === bot.id || j.jobId === bot.meeting_agent_job_id) &&
              !isTerminal(j.state)
          );
          if (already) continue;
          try {
            const status = await meetingApiService.getJobStatus(
              bot.meeting_agent_job_id
            );
            if (cancelled) return;
            if (isTerminal(normalizeState(status.state))) continue;
            const id = makeLocalId();
            setJobsBoth((prev) => [
              ...prev,
              {
                id,
                type: 'bot',
                botId: bot.id,
                jobId: bot.meeting_agent_job_id ?? undefined,
                meetingId: `bot-pending-${bot.id}`,
                meetingTitle: bot.title || 'Teams meeting',
                state: 'processing',
                message: BOT_STATUS_MESSAGE.transcribing,
                progress: 88,
                createdAt: Date.now(),
              },
            ]);
            pollCountsRef.current.set(id, 0);
            void pollJob(id);
          } catch {
            // import job gone — skip (no stuck row)
          }
        }
      } catch (err) {
        console.debug('[JobQueue] listBots discover skipped:', err);
      }
    };

    const discoverIdentifyJobs = async () => {
      if (cancelled) return;
      try {
        const remoteJobs = await meetingApiService.listJobs();
        if (cancelled) return;

        for (const remote of remoteJobs) {
          const type = (remote.job_type || '').toLowerCase();
          if (type !== 'identify') continue;
          const state = normalizeState(remote.state);
          if (isTerminal(state)) continue;

          const meetingId = remote.meeting_id || '';
          if (!meetingId || !remote.job_id) continue;

          const already = jobsRef.current.some(
            (j) =>
              j.jobId === remote.job_id ||
              (j.type === 'identify' && j.meetingId === meetingId && !isTerminal(j.state))
          );
          if (already) continue;

          trackJob({
            jobId: remote.job_id,
            type: 'identify',
            meetingId,
            meetingTitle: undefined,
          });
        }
      } catch (err) {
        console.debug('[JobQueue] listJobs discover skipped:', err);
      }
    };

    const tick = () => {
      void discoverBots();
      void discoverIdentifyJobs();
    };
    void tick();
    const interval = setInterval(tick, 4000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [clearPoll, finishJob, pollBotJob, pollJob, setJobsBoth, trackJob]);

  const activeCount = useMemo(
    () => jobs.filter((j) => isActiveState(j.state)).length,
    [jobs]
  );
  const queuedCount = useMemo(
    () => jobs.filter((j) => j.state === 'queued').length,
    [jobs]
  );

  const value = useMemo<JobQueueContextType>(
    () => ({
      jobs,
      activeCount,
      queuedCount,
      maxConcurrent: MAX_CONCURRENT,
      enqueueSummary,
      enqueueRetranscribe,
      enqueueImport,
      enqueueBot,
      trackJob,
      cancelLocal,
      dismissJob,
      isMeetingBusy,
      getJobsForMeeting,
    }),
    [
      jobs,
      activeCount,
      queuedCount,
      enqueueSummary,
      enqueueRetranscribe,
      enqueueImport,
      enqueueBot,
      trackJob,
      cancelLocal,
      dismissJob,
      isMeetingBusy,
      getJobsForMeeting,
    ]
  );

  return (
    <JobQueueContext.Provider value={value}>{children}</JobQueueContext.Provider>
  );
}

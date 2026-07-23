'use client';

import React, { useState } from 'react';
import {
  Loader2,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  FileText,
  RefreshCw,
  Upload,
  ListTodo,
  Users,
  Video,
} from 'lucide-react';
import {
  useJobQueue,
  type BackgroundJob,
  type BackgroundJobType,
} from '@/contexts/JobQueueContext';

function typeIcon(type: BackgroundJobType) {
  switch (type) {
    case 'summary':
      return FileText;
    case 'retranscribe':
      return RefreshCw;
    case 'import':
      return Upload;
    case 'identify':
      return Users;
    case 'bot':
      return Video;
  }
}

function typeLabel(type: BackgroundJobType) {
  switch (type) {
    case 'summary':
      return 'Summary';
    case 'retranscribe':
      return 'Retranscribe';
    case 'import':
      return 'Import';
    case 'identify':
      return 'Identify';
    case 'bot':
      return 'Meeting bot';
  }
}

function stateLabel(job: BackgroundJob) {
  switch (job.state) {
    case 'queued':
      return 'Queued';
    case 'starting':
      return 'Starting...';
    case 'pending':
      return 'Pending';
    case 'processing':
      return job.message || 'Processing...';
    case 'completed':
      return 'Done';
    case 'failed':
      return job.error || 'Failed';
    case 'cancelled':
      return 'Cancelled';
  }
}

function JobRow({
  job,
  onCancel,
  onDismiss,
}: {
  job: BackgroundJob;
  onCancel: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const Icon = typeIcon(job.type);
  const isDone = job.state === 'completed';
  const isError = job.state === 'failed' || job.state === 'cancelled';
  const isBusy =
    job.state === 'queued' ||
    job.state === 'starting' ||
    job.state === 'pending' ||
    job.state === 'processing';

  return (
    <div className="flex items-start gap-2 px-3 py-2 border-b border-gray-100 last:border-0">
      <div
        className={`mt-0.5 flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
          isDone
            ? 'bg-green-100'
            : isError
              ? 'bg-red-100'
              : 'bg-gray-100'
        }`}
      >
        {isDone ? (
          <Check className="w-3.5 h-3.5 text-green-600" />
        ) : isError ? (
          <X className="w-3.5 h-3.5 text-red-600" />
        ) : isBusy && job.state !== 'queued' ? (
          <Loader2 className="w-3.5 h-3.5 text-gray-600 animate-spin" />
        ) : (
          <Icon className="w-3.5 h-3.5 text-gray-600" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-gray-900 truncate">
            {typeLabel(job.type)}
            {job.meetingTitle ? (
              <span className="font-normal text-gray-500"> · {job.meetingTitle}</span>
            ) : null}
          </p>
          {isBusy ? (
            <button
              type="button"
              onClick={() => onCancel(job.id)}
              className="text-xs text-gray-400 hover:text-gray-700 shrink-0"
              title={
                job.type === 'bot' && !job.jobId
                  ? 'Stop bot on server'
                  : job.type === 'bot' && job.jobId
                    ? 'Cancel transcription'
                    : 'Cancel job'
              }
            >
              {job.type === 'bot' && !job.jobId ? 'Stop' : 'Cancel'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onDismiss(job.id)}
              className="text-xs text-gray-400 hover:text-gray-700 shrink-0"
            >
              Dismiss
            </button>
          )}
        </div>
        <p
          className={`text-xs truncate ${
            isError ? 'text-red-600' : isDone ? 'text-green-600' : 'text-gray-500'
          }`}
        >
          {stateLabel(job)}
        </p>
        {typeof job.progress === 'number' && isBusy && (
          <div className="mt-1.5 w-full h-1 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gray-900 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, job.progress))}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function ProcessingJobsIndicator() {
  const { jobs, activeCount, queuedCount, maxConcurrent, cancelLocal, dismissJob } =
    useJobQueue();
  // Expand by default when there are jobs so bot status is visible after dialog closes
  const [expanded, setExpanded] = useState(true);
  const [userCollapsed, setUserCollapsed] = useState(false);

  const busyTotal = activeCount + queuedCount;
  const showExpanded = expanded && !userCollapsed;

  // Auto-expand when a new job appears
  React.useEffect(() => {
    if (jobs.length > 0 && busyTotal > 0) {
      setExpanded(true);
      setUserCollapsed(false);
    }
  }, [jobs.length, busyTotal]);

  if (jobs.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)]">
      <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
        <button
          type="button"
          onClick={() => {
            setUserCollapsed((c) => !c);
            setExpanded((v) => !v);
          }}
          className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
        >
          <div className="relative flex-shrink-0">
            {busyTotal > 0 ? (
              <Loader2 className="w-4 h-4 text-gray-700 animate-spin" />
            ) : (
              <ListTodo className="w-4 h-4 text-gray-700" />
            )}
            {busyTotal > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-gray-900 text-white text-[10px] leading-3.5 flex items-center justify-center">
                {busyTotal}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">
              {busyTotal > 0
                ? `${busyTotal} job${busyTotal === 1 ? '' : 's'} processing`
                : 'Jobs finished'}
            </p>
            <p className="text-xs text-gray-500">
              {activeCount}/{maxConcurrent} active
              {queuedCount > 0 ? ` · ${queuedCount} queued` : ''}
              {jobs.some((j) => j.type === 'bot') ? ' · includes meeting bot' : ''}
            </p>
          </div>
          {showExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          )}
        </button>

        {showExpanded && (
          <div className="max-h-72 overflow-y-auto border-t border-gray-100">
            {jobs.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                onCancel={cancelLocal}
                onDismiss={dismissJob}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

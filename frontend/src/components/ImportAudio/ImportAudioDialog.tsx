import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Upload,
  Loader2,
  AlertCircle,
  FileAudio,
  Clock,
  HardDrive,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { toast } from 'sonner';
import { useImportAudio } from '@/hooks/useImportAudio';
import { useRouter } from 'next/navigation';
import { useSidebar } from '../Sidebar/SidebarProvider';
import { useJobQueue } from '@/contexts/JobQueueContext';

interface ImportAudioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedFile?: string | null;
  onComplete?: () => void;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function ImportAudioDialog({
  open,
  onOpenChange,
  preselectedFile,
  onComplete,
}: ImportAudioDialogProps) {
  const router = useRouter();
  const { refetchMeetings } = useSidebar();
  const { enqueueImport, activeCount, maxConcurrent, queuedCount } = useJobQueue();

  const [title, setTitle] = useState('');
  const [titleModifiedByUser, setTitleModifiedByUser] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const prevOpenRef = useRef(false);

  const {
    status,
    fileInfo,
    error,
    selectFile,
    validateFile,
    reset,
  } = useImportAudio();

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;

    if (open && !wasOpen) {
      reset();
      setTitle('');
      setTitleModifiedByUser(false);
      setSubmitError(null);

      if (preselectedFile) {
        validateFile(preselectedFile).then((info) => {
          if (info) {
            setTitle(info.filename);
          }
        });
      }
    }
  }, [open, preselectedFile, reset, validateFile]);

  useEffect(() => {
    if (fileInfo && !title && !titleModifiedByUser) {
      setTitle(fileInfo.filename);
    }
  }, [fileInfo, title, titleModifiedByUser]);

  const handleSelectFile = async () => {
    const info = await selectFile();
    if (info) {
      setTitle(info.filename);
      setSubmitError(null);
    }
  };

  const handleStartImport = useCallback(() => {
    if (!fileInfo) return;

    const meetingTitle = title || fileInfo.filename;

    enqueueImport({
      sourcePath: fileInfo.path,
      title: meetingTitle,
      language: null,
      model: null,
      provider: null,
      onComplete: async (meetingId) => {
        await refetchMeetings();
        onComplete?.();
        router.push(`/meeting-details?id=${meetingId}`);
      },
    });

    toast.info('Import running in background', {
      description:
        activeCount + queuedCount >= maxConcurrent
          ? `Queued — max ${maxConcurrent} concurrent jobs`
          : meetingTitle,
    });

    onOpenChange(false);
    reset();
    setTitle('');
    setTitleModifiedByUser(false);
    setSubmitError(null);
  }, [
    activeCount,
    enqueueImport,
    fileInfo,
    maxConcurrent,
    onComplete,
    onOpenChange,
    queuedCount,
    refetchMeetings,
    reset,
    router,
    title,
  ]);

  const displayError = submitError || error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {displayError ? (
              <>
                <AlertCircle className="h-5 w-5 text-red-600" />
                Import Failed
              </>
            ) : (
              <>
                <Upload className="h-5 w-5 text-blue-600" />
                Import Audio File
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {displayError
              ? 'An error occurred'
              : 'Import runs in the background. Track progress in the jobs panel (bottom-right).'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!displayError && (
            <>
              {fileInfo ? (
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <FileAudio className="h-8 w-8 text-blue-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{fileInfo.filename}</p>
                      <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDuration(fileInfo.duration_seconds)}
                        </span>
                        <span className="flex items-center gap-1">
                          <HardDrive className="h-3.5 w-3.5" />
                          {formatFileSize(fileInfo.size_bytes)}
                        </span>
                        <span className="text-blue-600 font-medium">{fileInfo.format}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Meeting Title</label>
                    <Input
                      value={title}
                      onChange={(e) => {
                        setTitle(e.target.value);
                        setTitleModifiedByUser(true);
                      }}
                      placeholder="Enter meeting title"
                    />
                  </div>

                  <Button variant="outline" size="sm" onClick={handleSelectFile} className="w-full">
                    Choose Different File
                  </Button>
                </div>
              ) : (
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <FileAudio className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <Button onClick={handleSelectFile} disabled={status === 'validating'}>
                    {status === 'validating' ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Validating...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Select Audio File
                      </>
                    )}
                  </Button>
                  <p className="text-sm text-gray-500 mt-2">MP4, WAV, MP3, FLAC, OGG, MKV, WebM, WMA</p>
                </div>
              )}
            </>
          )}

          {displayError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-800">{displayError}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          {!displayError && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleStartImport}
                className="bg-blue-600 hover:bg-blue-700"
                disabled={!fileInfo}
              >
                <Upload className="h-4 w-4 mr-2" />
                Import in Background
              </Button>
            </>
          )}
          {displayError && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button
                onClick={() => {
                  reset();
                  setSubmitError(null);
                }}
                variant="outline"
              >
                Try Again
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

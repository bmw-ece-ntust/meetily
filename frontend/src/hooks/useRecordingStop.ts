import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'sonner';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useRecordingState, RecordingStatus } from '@/contexts/RecordingStateContext';
import Analytics from '@/lib/analytics';

type SummaryStatus = 'idle' | 'processing' | 'summarizing' | 'regenerating' | 'completed' | 'error';

interface UseRecordingStopReturn {
  handleRecordingStop: (callApi: boolean) => Promise<void>;
  isStopping: boolean;
  isProcessingTranscript: boolean;
  isSavingTranscript: boolean;
  summaryStatus: SummaryStatus;
  setIsStopping: (value: boolean) => void;
}

/**
 * Custom hook for managing recording stop lifecycle.
 * Simplified for backend API integration - transcription and storage handled by ai-meeting-agent.
 */
export function useRecordingStop(
  setIsRecording: (value: boolean) => void,
  setIsRecordingDisabled: (value: boolean) => void
): UseRecordingStopReturn {
  const recordingState = useRecordingState();
  const {
    status,
    setStatus,
    isStopping,
    isProcessing: isProcessingTranscript,
    isSaving: isSavingTranscript
  } = recordingState;

  const {
    refetchMeetings,
    setCurrentMeeting,
    setMeetings,
    meetings,
    setIsMeetingActive,
  } = useSidebar();

  const router = useRouter();

  const isStoppingRef = useRef(false);
  const [summaryStatus, setSummaryStatus] = useState<SummaryStatus>('idle');

  const setIsStopping = useCallback((value: boolean) => {
    isStoppingRef.current = value;
    if (value) {
      setStatus(RecordingStatus.STOPPING, 'Stopping recording...');
    }
  }, [setStatus]);

  const handleRecordingStop = useCallback(async (isCallApi: boolean) => {
    if (isStoppingRef.current) {
      console.log('⚠️ Stop already in progress, ignoring duplicate call');
      return;
    }

    isStoppingRef.current = true;
    setIsStopping(true);
    const stopStartTime = Date.now();

    try {
      console.log('🛑 Recording stop initiated', {
        timestamp: new Date().toISOString(),
        call_api: isCallApi
      });

      setStatus(RecordingStatus.STOPPING, 'Stopping recording...');

      // Listen for recording-stopped event from Rust
      const unlistenStopped = await listen<{ 
        meeting_id: string;
        folder_path: string;
        meeting_name: string;
      }>('recording-stopped', async (event) => {
        console.log('📡 Received recording-stopped event from Rust:', event.payload);
        
        const { meeting_id, folder_path, meeting_name } = event.payload;

        // Store for later use
        sessionStorage.setItem('last_recording_meeting_id', meeting_id);
        sessionStorage.setItem('last_recording_folder_path', folder_path);
        sessionStorage.setItem('last_recording_meeting_name', meeting_name);

        // Track analytics
        Analytics.track('recording_stopped', {
          meeting_id,
          meeting_name,
          duration: ((Date.now() - stopStartTime) / 1000).toString()
        });

        // Update UI state
        setIsRecording(false);
        setIsRecordingDisabled(false);
        setStatus(RecordingStatus.IDLE, '');
        setIsMeetingActive(false);

        // Refresh meetings list to show the new meeting
        await refetchMeetings();

        // Navigate to meeting details
        setCurrentMeeting({ id: meeting_id, title: meeting_name });
        router.push(`/meeting-details?id=${meeting_id}`);

        toast.success('Recording saved successfully');

        // Cleanup
        sessionStorage.removeItem('last_recording_meeting_id');
        sessionStorage.removeItem('last_recording_folder_path');
        sessionStorage.removeItem('last_recording_meeting_name');
        isStoppingRef.current = false;
        setIsStopping(false);
      });

      // Call Rust stop_recording command
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('stop_recording');

      console.log('✅ stop_recording command sent to Rust');

    } catch (error) {
      console.error('❌ Error stopping recording:', error);
      toast.error('Failed to stop recording: ' + (error as Error).message);
      
      setIsRecording(false);
      setIsRecordingDisabled(false);
      setStatus(RecordingStatus.IDLE, '');
      isStoppingRef.current = false;
      setIsStopping(false);
    }
  }, [
    setIsStopping,
    setStatus,
    setIsRecording,
    setIsRecordingDisabled,
    setIsMeetingActive,
    refetchMeetings,
    setCurrentMeeting,
    router
  ]);

  return {
    handleRecordingStop,
    isStopping: isStoppingRef.current,
    isProcessingTranscript,
    isSavingTranscript,
    summaryStatus,
    setIsStopping,
  };
}

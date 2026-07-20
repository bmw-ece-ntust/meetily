'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Mic, Upload, FileText, Sparkles } from 'lucide-react';
import { RecordingControls } from '@/components/RecordingControls';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { usePermissionCheck } from '@/hooks/usePermissionCheck';
import { useRecordingState, RecordingStatus } from '@/contexts/RecordingStateContext';
import { useConfig } from '@/contexts/ConfigContext';
import { useImportDialog } from '@/contexts/ImportDialogContext';
import { StatusOverlays } from '@/app/_components/StatusOverlays';
import Analytics from '@/lib/analytics';
import { SettingsModals } from './_components/SettingsModal';
import { useModalState } from '@/hooks/useModalState';
import { useRecordingStateSync } from '@/hooks/useRecordingStateSync';
import { useRecordingStart } from '@/hooks/useRecordingStart';
import { useRecordingStop } from '@/hooks/useRecordingStop';
import { Button } from '@/components/ui/button';

export default function Home() {
  const router = useRouter();
  const [isRecording, setIsRecordingState] = useState(false);
  const [barHeights, setBarHeights] = useState(['58%', '76%', '58%']);

  const { transcriptModelConfig, selectedDevices, betaFeatures } = useConfig();
  const recordingState = useRecordingState();
  const { status, isProcessing } = recordingState;

  const { hasMicrophone } = usePermissionCheck();
  const {
    setIsMeetingActive,
    isCollapsed: sidebarCollapsed,
    meetings,
    setCurrentMeeting,
    handleRecordingToggle,
  } = useSidebar();
  const { openImportDialog } = useImportDialog();
  const { modals, messages, showModal, hideModal } = useModalState(transcriptModelConfig);
  const { isRecordingDisabled, setIsRecordingDisabled } = useRecordingStateSync(isRecording, setIsRecordingState, setIsMeetingActive);
  const { handleRecordingStart } = useRecordingStart(isRecording, setIsRecordingState, showModal);
  const { handleRecordingStop, setIsStopping } = useRecordingStop(
    setIsRecordingState,
    setIsRecordingDisabled
  );

  useEffect(() => {
    Analytics.trackPageView('home');
  }, []);

  useEffect(() => {
    if (recordingState.isRecording) {
      const interval = setInterval(() => {
        setBarHeights(prev => {
          const newHeights = [...prev];
          newHeights[0] = Math.random() * 20 + 10 + 'px';
          newHeights[1] = Math.random() * 20 + 10 + 'px';
          newHeights[2] = Math.random() * 20 + 10 + 'px';
          return newHeights;
        });
      }, 300);
      return () => clearInterval(interval);
    }
  }, [recordingState.isRecording]);

  const isProcessingStop = status === RecordingStatus.PROCESSING_TRANSCRIPTS || isProcessing;
  const recentMeetings = meetings.slice(0, 5);
  const showIdleContent = !recordingState.isRecording
    && status !== RecordingStatus.PROCESSING_TRANSCRIPTS
    && status !== RecordingStatus.SAVING;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="flex flex-col h-screen bg-gray-50"
    >
      <SettingsModals
        modals={modals}
        messages={messages}
        onClose={hideModal}
      />

      <div className="flex flex-1 overflow-hidden relative">
        {showIdleContent && (
          <div
            className="absolute inset-0 flex items-center justify-center px-6 transition-[margin] duration-300"
            style={{ marginLeft: sidebarCollapsed ? '4rem' : '16rem' }}
          >
            <div className="w-full max-w-xl text-center -mt-20">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <Sparkles className="h-7 w-7" />
              </div>
              <h1 className="text-2xl font-semibold text-gray-900 mb-2">
                Ready for your next meeting
              </h1>
              <p className="text-sm text-gray-500 mb-8">
                Record live audio or import a file. Transcripts and summaries are processed by your AI server.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
                <Button
                  className="bg-red-500 hover:bg-red-600 text-white px-5"
                  onClick={() => {
                    Analytics.trackButtonClick('start_recording', 'home_empty_state');
                    handleRecordingToggle();
                  }}
                  disabled={isRecordingDisabled}
                >
                  <Mic className="mr-2 h-4 w-4" />
                  Start Recording
                </Button>
                {betaFeatures.importAndRetranscribe && (
                  <Button
                    variant="outline"
                    className="px-5"
                    onClick={() => {
                      Analytics.trackButtonClick('import_audio', 'home_empty_state');
                      openImportDialog();
                    }}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Import Audio
                  </Button>
                )}
              </div>

              {recentMeetings.length > 0 && (
                <div className="text-left rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <h2 className="text-sm font-medium text-gray-700">Recent meetings</h2>
                  </div>
                  <ul className="divide-y divide-gray-100">
                    {recentMeetings.map((meeting) => (
                      <li key={meeting.id}>
                        <button
                          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                          onClick={() => {
                            setCurrentMeeting({ id: meeting.id, title: meeting.title });
                            router.push(`/meeting-details?id=${meeting.id}`);
                          }}
                        >
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
                            <FileText className="h-4 w-4 text-gray-500" />
                          </div>
                          <span className="text-sm text-gray-800 truncate">{meeting.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {(hasMicrophone || isRecording) &&
          status !== RecordingStatus.PROCESSING_TRANSCRIPTS &&
          status !== RecordingStatus.SAVING && (
            <div className="fixed bottom-12 left-0 right-0 z-10">
              <div
                className="flex justify-center pl-8 transition-[margin] duration-300"
                style={{
                  marginLeft: sidebarCollapsed ? '4rem' : '16rem'
                }}
              >
                <div className="w-2/3 max-w-[750px] flex justify-center">
                  <div className="bg-white rounded-full shadow-lg flex items-center">
                    <RecordingControls
                      isRecording={recordingState.isRecording}
                      onRecordingStop={(callApi = true) => handleRecordingStop(callApi)}
                      onRecordingStart={handleRecordingStart}
                      onTranscriptReceived={() => { }}
                      onStopInitiated={() => setIsStopping(true)}
                      barHeights={barHeights}
                      onTranscriptionError={(message) => {
                        showModal('errorAlert', message);
                      }}
                      isRecordingDisabled={isRecordingDisabled}
                      isParentProcessing={isProcessingStop}
                      selectedDevices={selectedDevices}
                      meetingName=""
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

        <StatusOverlays
          isProcessing={status === RecordingStatus.PROCESSING_TRANSCRIPTS && !recordingState.isRecording}
          isSaving={status === RecordingStatus.SAVING}
          sidebarCollapsed={sidebarCollapsed}
        />
      </div>
    </motion.div>
  );
}

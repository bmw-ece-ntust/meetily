"use client"
import { useSidebar } from "@/components/Sidebar/SidebarProvider";
import { useState, useEffect, useCallback, Suspense } from "react";
import { Transcript, Summary } from "@/types";
import PageContent from "./page-content";
import { useRouter, useSearchParams } from "next/navigation";
import Analytics from "@/lib/analytics";
import { invoke } from "@tauri-apps/api/core";
import { LoaderIcon } from "lucide-react";
import { useConfig } from "@/contexts/ConfigContext";

interface MeetingDetailsResponse {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  transcripts: Transcript[];
  folder_path?: string;
}

function MeetingDetailsContent() {
  const searchParams = useSearchParams();
  const meetingId = searchParams.get('id');
  const source = searchParams.get('source'); // Check if navigated from recording
  const { setCurrentMeeting, refetchMeetings, stopSummaryPolling } = useSidebar();
  const { isAutoSummary } = useConfig(); // Get auto-summary toggle state
  const router = useRouter();
  const [meetingDetails, setMeetingDetails] = useState<MeetingDetailsResponse | null>(null);
  const [meetingSummary, setMeetingSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [shouldAutoGenerate, setShouldAutoGenerate] = useState<boolean>(false);
  const [hasCheckedAutoGen, setHasCheckedAutoGen] = useState<boolean>(false);

  // Fetch meeting data (no pagination - simple load)
  const fetchMeetingData = useCallback(async () => {
    if (!meetingId || meetingId === 'intro-call') {
      setError('Invalid meeting ID');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const details = await invoke<MeetingDetailsResponse>('get_meeting_details', { id: meetingId });
      setMeetingDetails(details);
      
      // Load summary if exists
      try {
        const summary = await invoke<Summary>('get_meeting_summary', { meetingId });
        setMeetingSummary(summary);
      } catch (err) {
        console.log('No summary found for meeting');
      }
      
      setIsLoading(false);
    } catch (err) {
      console.error('Failed to load meeting:', err);
      setError(err instanceof Error ? err.message : 'Failed to load meeting');
      setIsLoading(false);
    }
  }, [meetingId]);

  // Setup auto-generation for meetings from recording
  const setupAutoGeneration = useCallback(async () => {
    if (hasCheckedAutoGen) return;

    // Only auto-generate if navigated from recording
    if (source !== 'recording') {
      console.log('Not from recording navigation, skipping auto-generation');
      setHasCheckedAutoGen(true);
      return;
    }

    // Respect user's auto-summary toggle preference
    if (!isAutoSummary) {
      console.log('Auto-summary is disabled in settings');
      setHasCheckedAutoGen(true);
      return;
    }

    setShouldAutoGenerate(true);
    setHasCheckedAutoGen(true);
  }, [hasCheckedAutoGen, source, isAutoSummary]);

  // Initial data fetch
  useEffect(() => {
    console.log('MeetingDetails useEffect triggered - meetingId:', meetingId);

    if (!meetingId || meetingId === 'intro-call') {
      console.warn('No valid meeting ID in URL - meetingId:', meetingId);
      setError("No meeting selected");
      setIsLoading(false);
      Analytics.trackPageView('meeting_details');
      return;
    }

    console.log('Valid meeting ID found, fetching details for:', meetingId);
    fetchMeetingData();
    Analytics.trackPageView('meeting_details');
  }, [meetingId, fetchMeetingData]);

  // Setup auto-generation after meeting loads
  useEffect(() => {
    if (meetingDetails && !hasCheckedAutoGen) {
      setupAutoGeneration();
    }
  }, [meetingDetails, hasCheckedAutoGen, setupAutoGeneration]);

  // Cleanup: Stop polling when navigating away
  useEffect(() => {
    return () => {
      if (meetingId) {
        console.log('Cleaning up: Stopping summary polling for meeting:', meetingId);
        stopSummaryPolling(meetingId);
      }
    };
  }, [meetingId, stopSummaryPolling]);

  // Handle auto-generation complete
  const handleAutoGenerateComplete = useCallback(() => {
    setShouldAutoGenerate(false);
  }, []);

  // Refetch meeting data
  const handleMeetingUpdated = useCallback(async () => {
    await fetchMeetingData();
  }, [fetchMeetingData]);

  // Refetch transcripts
  const handleRefetchTranscripts = useCallback(async () => {
    await fetchMeetingData();
  }, [fetchMeetingData]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Show loading spinner while initial data loads
  if (isLoading || !meetingDetails) {
    return <div className="flex items-center justify-center h-screen">
      <LoaderIcon className="animate-spin size-6 " />
    </div>;
  }

  return <PageContent
    meeting={meetingDetails}
    summaryData={meetingSummary}
    shouldAutoGenerate={shouldAutoGenerate}
    onAutoGenerateComplete={handleAutoGenerateComplete}
    onMeetingUpdated={handleMeetingUpdated}
    onRefetchTranscripts={handleRefetchTranscripts}
  />;
}

export default function MeetingDetails() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen">
        <LoaderIcon className="animate-spin size-6" />
      </div>
    }>
      <MeetingDetailsContent />
    </Suspense>
  );
}

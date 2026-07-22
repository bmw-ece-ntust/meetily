"use client"
import { useSidebar } from "@/components/Sidebar/SidebarProvider";
import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { Transcript, Summary } from "@/types";
import PageContent from "./page-content";
import { useRouter, useSearchParams } from "next/navigation";
import Analytics from "@/lib/analytics";
import { LoaderIcon } from "lucide-react";
import { useConfig } from "@/contexts/ConfigContext";
import { meetingApiService } from "@/services/meetingApiService";
import { useJobQueueOptional } from "@/contexts/JobQueueContext";

interface MeetingDetailsResponse {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  date?: string | null;
  transcripts: Transcript[];
  refinedText: string | null;
  folder_path?: string;
  participants?: string[];
  location?: string | null;
  organizer?: string | null;
  audio_file?: string | null;
}

function MeetingDetailsContent() {
  const searchParams = useSearchParams();
  const meetingId = searchParams.get('id');
  const source = searchParams.get('source');
  const { stopSummaryPolling } = useSidebar();
  const { isAutoSummary } = useConfig();
  const router = useRouter();
  const jobQueue = useJobQueueOptional();
  const [meetingDetails, setMeetingDetails] = useState<MeetingDetailsResponse | null>(null);
  const [meetingSummary, setMeetingSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [shouldAutoGenerate, setShouldAutoGenerate] = useState<boolean>(false);
  const [hasCheckedAutoGen, setHasCheckedAutoGen] = useState<boolean>(false);
  const identifyRefreshKey = useRef<string>('');

  const fetchMeetingData = useCallback(async () => {
    if (!meetingId || meetingId === 'intro-call') {
      setError('Invalid meeting ID');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const meeting = await meetingApiService.getMeeting(meetingId);
      const { segments, refinedText } = await meetingApiService.getTranscript(meetingId);

      setMeetingDetails({
        id: meeting.id,
        title: meeting.title,
        created_at: meeting.created_at,
        updated_at: meeting.updated_at,
        date: meeting.date ?? null,
        transcripts: segments,
        refinedText,
        folder_path: meeting.folder_path,
        participants: Array.isArray(meeting.participants) ? meeting.participants : [],
        location: meeting.location ?? null,
        organizer: meeting.organizer ?? null,
        audio_file: meeting.audio_file ?? null,
      });

      try {
        // Default template is "full" — load that if present, else null (needs generate)
        const summary = await meetingApiService.getSummary(meetingId, 'full');
        setMeetingSummary(summary);
      } catch {
        setMeetingSummary(null);
      }

      setIsLoading(false);
    } catch (err) {
      console.error('Failed to load meeting:', err);
      setError(err instanceof Error ? err.message : 'Failed to load meeting');
      setIsLoading(false);
    }
  }, [meetingId]);

  const setupAutoGeneration = useCallback(async () => {
    if (hasCheckedAutoGen) return;
    if (source !== 'recording' || !isAutoSummary) {
      setHasCheckedAutoGen(true);
      return;
    }
    setShouldAutoGenerate(true);
    setHasCheckedAutoGen(true);
  }, [hasCheckedAutoGen, source, isAutoSummary]);

  useEffect(() => {
    if (!meetingId || meetingId === 'intro-call') {
      setError("No meeting selected");
      setIsLoading(false);
      Analytics.trackPageView('meeting_details');
      return;
    }
    fetchMeetingData();
    Analytics.trackPageView('meeting_details');
  }, [meetingId, fetchMeetingData]);

  useEffect(() => {
    if (meetingDetails && !hasCheckedAutoGen) {
      setupAutoGeneration();
    }
  }, [meetingDetails, hasCheckedAutoGen, setupAutoGeneration]);

  useEffect(() => {
    return () => {
      if (meetingId) stopSummaryPolling(meetingId);
    };
  }, [meetingId, stopSummaryPolling]);

  // Auto-refresh transcript when background identify job for this meeting completes.
  useEffect(() => {
    if (!meetingId || !jobQueue) return;
    const identifyJobs = jobQueue.getJobsForMeeting(meetingId).filter((j) => j.type === 'identify');
    const justCompleted = identifyJobs.some((j) => j.state === 'completed');
    if (!justCompleted) return;
    // Avoid refetch loops if completed job lingers in the list.
    const key = identifyJobs.map((j) => `${j.id}:${j.state}`).join('|');
    if (identifyRefreshKey.current === key) return;
    identifyRefreshKey.current = key;
    void fetchMeetingData();
  }, [meetingId, jobQueue, jobQueue?.jobs, fetchMeetingData]);

  const handleAutoGenerateComplete = useCallback(() => {
    setShouldAutoGenerate(false);
  }, []);

  const handleMeetingUpdated = useCallback(async () => {
    await fetchMeetingData();
  }, [fetchMeetingData]);

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

  if (isLoading || !meetingDetails) {
    return (
      <div className="flex items-center justify-center h-screen">
        <LoaderIcon className="animate-spin size-6 " />
      </div>
    );
  }

  return (
    <PageContent
      meeting={meetingDetails}
      summaryData={meetingSummary}
      shouldAutoGenerate={shouldAutoGenerate}
      onAutoGenerateComplete={handleAutoGenerateComplete}
      onMeetingUpdated={handleMeetingUpdated}
      onRefetchTranscripts={handleRefetchTranscripts}
    />
  );
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

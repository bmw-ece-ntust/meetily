import { useState, useCallback, useRef, useEffect } from 'react';
import { Transcript, Summary } from '@/types';
import { BlockNoteSummaryViewRef } from '@/components/AISummary/BlockNoteSummaryView';
import { CurrentMeeting, useSidebar } from '@/components/Sidebar/SidebarProvider';
import { invoke as invokeTauri } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { voiceBankApiService } from '@/services/voiceBankApiService';

interface UseMeetingDataProps {
  meeting: any;
  summaryData: Summary | null;
  onMeetingUpdated?: () => Promise<void>;
}

export function useMeetingData({ meeting, summaryData, onMeetingUpdated }: UseMeetingDataProps) {
  // State
  // Use prop directly since summary generation fetches transcripts independently
  // Add defensive null check to prevent undefined transcripts
  const transcripts = Array.isArray(meeting?.transcripts) ? meeting.transcripts : [];
  const [meetingTitle, setMeetingTitle] = useState(meeting?.title || '+ New Call');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isTitleDirty, setIsTitleDirty] = useState(false);
  const [participants, setParticipants] = useState<string[]>(
    Array.isArray(meeting?.participants) ? meeting.participants : []
  );
  const [location, setLocation] = useState<string | null>(
    meeting?.location ?? null
  );
  const [organizer, setOrganizer] = useState<string | null>(
    meeting?.organizer ?? null
  );
  const [meetingDate, setMeetingDate] = useState<string | null>(
    meeting?.date ?? meeting?.created_at ?? null
  );
  const [aiSummary, setAiSummary] = useState<Summary | null>(summaryData);
  const [isSaving, setIsSaving] = useState(false);
  const [isSummaryDirty, setIsSummaryDirty] = useState(false);
  const [summaryTemplate, setSummaryTemplate] = useState<string>('full');
  const [, setError] = useState<string>('');

  // Ref for BlockNoteSummaryView
  const blockNoteSummaryRef = useRef<BlockNoteSummaryViewRef>(null);

  // Sidebar context
  const { setCurrentMeeting, setMeetings, meetings: sidebarMeetings } = useSidebar();

  // Sync aiSummary state when summaryData prop changes (fixes display of fetched summaries)
  useEffect(() => {
    console.log('[useMeetingData] Syncing summary data from prop:', summaryData ? 'present' : 'null');
    setAiSummary(summaryData);
  }, [summaryData]); // Only trigger when parent prop changes, not when aiSummary changes

  useEffect(() => {
    if (meeting?.title) {
      setMeetingTitle(meeting.title);
      setIsTitleDirty(false);
    }
    if (Array.isArray(meeting?.participants)) {
      setParticipants(meeting.participants);
    }
    setLocation(meeting?.location ?? null);
    setOrganizer(meeting?.organizer ?? null);
    setMeetingDate(meeting?.date ?? meeting?.created_at ?? null);
  }, [
    meeting?.id,
    meeting?.title,
    meeting?.participants,
    meeting?.location,
    meeting?.organizer,
    meeting?.date,
    meeting?.created_at,
  ]);

  // Handlers
  const handleTitleChange = useCallback((newTitle: string) => {
    setMeetingTitle(newTitle);
    setIsTitleDirty(true);
  }, []);

  const handleSummaryChange = useCallback((newSummary: Summary) => {
    setAiSummary(newSummary);
  }, []);

  const handleSaveMeetingTitle = useCallback(async (titleOverride?: string) => {
    const titleToSave = (titleOverride ?? meetingTitle).trim();
    if (!titleToSave) {
      toast.error('Meeting title cannot be empty');
      return false;
    }
    try {
      const result = await invokeTauri<{ success: boolean; error?: string }>('update_meeting', {
        id: meeting.id,
        title: titleToSave,
        participants: null,
        date: null,
        location: null,
        organizer: null,
      });
      if (result && result.success === false) {
        throw new Error(result.error || 'Failed to update meeting title');
      }

      console.log('Save meeting title success');
      setMeetingTitle(titleToSave);
      setIsTitleDirty(false);

      // Update meetings with new title
      const updatedMeetings = sidebarMeetings.map((m: CurrentMeeting) =>
        m.id === meeting.id ? { id: m.id, title: titleToSave } : m
      );
      setMeetings(updatedMeetings);
      setCurrentMeeting({ id: meeting.id, title: titleToSave });
      if (onMeetingUpdated) await onMeetingUpdated();
      toast.success('Meeting title updated');
      return true;
    } catch (error) {
      console.error('Failed to save meeting title:', error);
      toast.error('Failed to update meeting title', {
        description: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError('Failed to save meeting title: Unknown error');
      }
      return false;
    }
  }, [meeting.id, meetingTitle, sidebarMeetings, setMeetings, setCurrentMeeting, onMeetingUpdated]);

  const handleSaveParticipants = useCallback(async (next: string[]) => {
    const cleaned = next.map((n) => n.trim()).filter(Boolean);
    try {
      const result = await invokeTauri<{ success: boolean; error?: string; data?: { participants?: string[] } }>(
        'update_meeting',
        {
          id: meeting.id,
          title: null,
          participants: cleaned,
          date: null,
          location: null,
          organizer: null,
        }
      );
      if (result && result.success === false) {
        throw new Error(result.error || 'Failed to update participants');
      }
      const saved = result?.data?.participants ?? cleaned;
      setParticipants(saved);
      if (onMeetingUpdated) await onMeetingUpdated();
      toast.success('Participants updated');
      return true;
    } catch (error) {
      console.error('Failed to save participants:', error);
      toast.error('Failed to update participants', {
        description: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }, [meeting.id, onMeetingUpdated]);

  const handleSaveMeetingDetails = useCallback(
    async (fields: {
      date?: string | null;
      location?: string | null;
      organizer?: string | null;
    }) => {
      try {
        const result = await invokeTauri<{
          success: boolean;
          error?: string;
          data?: {
            date?: string;
            location?: string | null;
            organizer?: string | null;
          };
        }>('update_meeting', {
          id: meeting.id,
          title: null,
          participants: null,
          date: fields.date ?? null,
          location: fields.location !== undefined ? fields.location ?? '' : null,
          organizer: fields.organizer !== undefined ? fields.organizer ?? '' : null,
        });
        if (result && result.success === false) {
          throw new Error(result.error || 'Failed to update meeting details');
        }
        if (result?.data?.date) setMeetingDate(result.data.date);
        else if (fields.date) setMeetingDate(fields.date);
        if (fields.location !== undefined) {
          setLocation(result?.data?.location ?? fields.location);
        }
        if (fields.organizer !== undefined) {
          setOrganizer(result?.data?.organizer ?? fields.organizer);
        }
        if (onMeetingUpdated) await onMeetingUpdated();
        toast.success('Meeting details updated');
        return true;
      } catch (error) {
        console.error('Failed to save meeting details:', error);
        toast.error('Failed to update meeting details', {
          description: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    },
    [meeting.id, onMeetingUpdated]
  );

  const handleRenameSpeakers = useCallback(
    async (mapping: Record<string, string>) => {
      try {
        const result = await invokeTauri<{
          success: boolean;
          error?: string;
          data?: { updated_segments?: number };
        }>('rename_meeting_speakers', {
          id: meeting.id,
          mapping,
        });
        if (result && result.success === false) {
          throw new Error(result.error || 'Failed to rename speakers');
        }
        if (onMeetingUpdated) await onMeetingUpdated();
        const n = result?.data?.updated_segments ?? 0;
        toast.success(n > 0 ? `Renamed speakers (${n} segments)` : 'Speakers renamed');
        return true;
      } catch (error) {
        console.error('Failed to rename speakers:', error);
        toast.error('Failed to rename speakers', {
          description: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    },
    [meeting.id, onMeetingUpdated]
  );

  const handleIdentifySpeakers = useCallback(async () => {
    try {
      const result = await voiceBankApiService.identifySpeakers(meeting.id);
      if (onMeetingUpdated) await onMeetingUpdated();
      const enrolled = result.identities.filter((i) => i.person_id && i.display_name.startsWith('Guest-')).length;
      const parts: string[] = [];
      if (result.matched > 0) parts.push(`${result.matched} matched`);
      if (result.guests > 0) {
        parts.push(
          enrolled > 0
            ? `${result.guests} new in voice bank`
            : `${result.guests} guests`
        );
      }
      if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
      toast.success(
        `Identified speakers (${result.updated_segments} segments): ${parts.join(', ') || 'done'}`,
        enrolled > 0
          ? { description: 'Rename Guest-N in Voice Bank when you know their names.' }
          : undefined
      );
      return true;
    } catch (error) {
      console.error('Failed to identify speakers:', error);
      toast.error('Failed to identify speakers', {
        description: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }, [meeting.id, onMeetingUpdated]);

  const handleSaveSummary = useCallback(async (summary: Summary | { markdown?: string; summary_json?: any[] }) => {
    console.log('📄 handleSaveSummary called with:', {
      hasMarkdown: 'markdown' in summary,
      hasSummaryJson: 'summary_json' in summary,
      summaryKeys: Object.keys(summary)
    });

    setIsSaving(true);
    try {
      let formattedSummary: any;

      // Check if it's the new BlockNote format
      if ('markdown' in summary || 'summary_json' in summary) {
        console.log('📄 Saving new format (markdown/blocknote)');
        formattedSummary = summary;
      } else {
        console.log('📄 Saving legacy format');
        formattedSummary = {
          MeetingName: meetingTitle,
          MeetingNotes: {
            sections: Object.entries(summary).map(([, section]) => ({
              title: section.title,
              blocks: section.blocks
            }))
          }
        };
      }

      await invokeTauri('api_save_meeting_summary', {
        meetingId: meeting.id,
        summary: formattedSummary,
        template: summaryTemplate,
      });

      setIsSummaryDirty(false);
      console.log('✅ Save meeting summary success');
      toast.success('Summary saved');
    } catch (error) {
      console.error('❌ Failed to save meeting summary:', error);
      toast.error('Failed to save summary', {
        description: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError('Failed to save meeting summary: Unknown error');
      }
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [meeting.id, meetingTitle, summaryTemplate]);

  const saveAllChanges = useCallback(async () => {
    setIsSaving(true);
    try {
      // Save meeting title only if changed
      if (isTitleDirty) {
        await handleSaveMeetingTitle();
      }

      // Save BlockNote editor changes if dirty
      if (blockNoteSummaryRef.current?.isDirty) {
        console.log('💾 Saving BlockNote editor changes...');
        await blockNoteSummaryRef.current.saveSummary();
      } else if (aiSummary && isSummaryDirty) {
        await handleSaveSummary(aiSummary);
      }

      toast.success("Changes saved successfully");
    } catch (error) {
      console.error('Failed to save changes:', error);
      toast.error("Failed to save changes", { description: String(error) });
    } finally {
      setIsSaving(false);
    }
  }, [isTitleDirty, handleSaveMeetingTitle, aiSummary, handleSaveSummary, isSummaryDirty]);

  // Update meeting title from external source (e.g., AI summary)
  const updateMeetingTitle = useCallback((newTitle: string) => {
    console.log('📝 Updating meeting title to:', newTitle);
    setMeetingTitle(newTitle);
    const updatedMeetings = sidebarMeetings.map((m: CurrentMeeting) =>
      m.id === meeting.id ? { id: m.id, title: newTitle } : m
    );
    setMeetings(updatedMeetings);
    setCurrentMeeting({ id: meeting.id, title: newTitle });
  }, [meeting.id, sidebarMeetings, setMeetings, setCurrentMeeting]);

  return {
    // State
    transcripts,
    meetingTitle,
    isEditingTitle,
    isTitleDirty,
    participants,
    location,
    organizer,
    meetingDate,
    aiSummary,
    isSaving,
    isSummaryDirty,
    summaryTemplate,
    blockNoteSummaryRef,

    // Setters
    setMeetingTitle,
    setIsEditingTitle,
    setAiSummary,
    setIsSummaryDirty,
    setParticipants,
    setLocation,
    setOrganizer,
    setMeetingDate,
    setSummaryTemplate,

    // Handlers
    handleTitleChange,
    handleSummaryChange,
    handleSaveSummary,
    handleSaveMeetingTitle,
    handleSaveParticipants,
    handleSaveMeetingDetails,
    handleRenameSpeakers,
    handleIdentifySpeakers,
    saveAllChanges,
    updateMeetingTitle,
  };
}

"use client";

import { Summary, Transcript } from '@/types';
import { BlockNoteSummaryView, BlockNoteSummaryViewRef } from '@/components/AISummary/BlockNoteSummaryView';
import { EmptyStateSummary } from '@/components/EmptyStateSummary';
import { SummaryGeneratorButtonGroup } from './SummaryGeneratorButtonGroup';
import { SummaryUpdaterButtonGroup } from './SummaryUpdaterButtonGroup';
import { EditTitleDialog } from './EditTitleDialog';
import { EditParticipantsDialog } from './EditParticipantsDialog';
import { EditMeetingDetailsDialog } from './EditMeetingDetailsDialog';
import { EditSpeakerLabelsDialog } from './EditSpeakerLabelsDialog';
import { AudioPlayer } from '@/components/AudioPlayer';
import Analytics from '@/lib/analytics';
import { MapPin, Pencil, Tags, Users, XCircle } from 'lucide-react';
import { RefObject, useMemo, useState } from 'react';

interface SummaryPanelProps {
  meeting: {
    id: string;
    title: string;
    created_at: string;
    audio_file?: string | null;
  };
  meetingTitle: string;
  participants: string[];
  personNames?: { [personId: string]: string }; // Voice bank person names
  location: string | null;
  organizer: string | null;
  meetingDate: string | null;
  summaryRef: RefObject<BlockNoteSummaryViewRef>;
  onCopySummary: () => Promise<void>;
  aiSummary: Summary | null;
  summaryStatus: 'idle' | 'processing' | 'summarizing' | 'regenerating' | 'completed' | 'error';
  transcripts: Transcript[];
  onGenerateSummary: () => Promise<void>;
  onStopGeneration: () => void;
  onSaveSummary: (summary: Summary | { markdown?: string; summary_json?: any[] }) => Promise<void>;
  onSummaryChange: (summary: Summary) => void;
  onDirtyChange: (isDirty: boolean) => void;
  isSummaryDirty?: boolean;
  isSavingSummary?: boolean;
  onSaveSummaryClick?: () => Promise<void> | void;
  onSaveTitle: (title: string) => Promise<boolean>;
  onSaveParticipants: (participants: string[]) => Promise<boolean>;
  onSaveMeetingDetails: (fields: {
    date?: string | null;
    location?: string | null;
    organizer?: string | null;
  }) => Promise<boolean>;
  onRenameSpeakers: (mapping: Record<string, string>) => Promise<boolean>;
  onIdentifySpeakers: () => Promise<boolean>;
  onClearIdentification: () => Promise<boolean>;
  summaryError: string | null;
  onRegenerateSummary: () => Promise<void>;
  getSummaryStatusMessage: (status: 'idle' | 'processing' | 'summarizing' | 'regenerating' | 'completed' | 'error') => string;
  availableTemplates: Array<{ id: string, name: string, description: string }>;
  selectedTemplate: string;
  onTemplateSelect: (templateId: string, templateName: string) => void;
  onPublishToGithub?: () => Promise<void> | void;
  isPublishing?: boolean;
}

export function SummaryPanel({
  meeting,
  meetingTitle,
  participants,
  personNames = {},
  location,
  organizer,
  meetingDate,
  summaryRef,
  onCopySummary,
  aiSummary,
  summaryStatus,
  transcripts,
  onGenerateSummary,
  onStopGeneration,
  onSaveSummary,
  onSummaryChange,
  onDirtyChange,
  isSummaryDirty = false,
  isSavingSummary = false,
  onSaveSummaryClick,
  onSaveTitle,
  onSaveParticipants,
  onSaveMeetingDetails,
  onRenameSpeakers,
  onIdentifySpeakers,
  onClearIdentification,
  summaryError,
  onRegenerateSummary,
  getSummaryStatusMessage,
  availableTemplates,
  selectedTemplate,
  onTemplateSelect,
  onPublishToGithub,
  isPublishing = false,
}: SummaryPanelProps) {
  const [titleDialogOpen, setTitleDialogOpen] = useState(false);
  const [participantsDialogOpen, setParticipantsDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [speakersDialogOpen, setSpeakersDialogOpen] = useState(false);

  const isSummaryLoading = summaryStatus === 'processing' || summaryStatus === 'summarizing' || summaryStatus === 'regenerating';
  const hasRecording = Boolean(meeting.audio_file);

  const speakerLabels = useMemo(
    () =>
      Array.from(
        new Set(
          transcripts
            .map((t) => t.speaker?.trim())
            .filter((s): s is string => Boolean(s))
        )
      ),
    [transcripts]
  );

  // Helper to get speaker display info with person identification
  const getSpeakerDisplayInfo = (speaker: string) => {
    // Find a transcript segment with this speaker that has person_id
    const segment = transcripts.find((t) => t.speaker === speaker && t.person_id);
    const personId = segment?.person_id;
    const personName = personId ? personNames[personId] : null;
    const isIdentified = !!personName;
    const isGuest = personName?.startsWith('Guest-');

    let badgeColor = 'bg-violet-50 text-violet-800'; // Manual label (default)
    if (isIdentified) {
      if (isGuest) {
        badgeColor = 'bg-amber-50 text-amber-800'; // Guest
      } else {
        badgeColor = 'bg-green-50 text-green-800'; // Matched person
      }
    }

    return {
      displayName: personName || speaker,
      badgeColor,
      isIdentified,
      isGuest,
      personId,
    };
  };

  const detailsLine = useMemo(() => {
    const parts: string[] = [];
    if (meetingDate) {
      try {
        parts.push(
          new Date(meetingDate).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          })
        );
      } catch {
        parts.push(meetingDate);
      }
    }
    if (location?.trim()) parts.push(location.trim());
    if (organizer?.trim()) parts.push(`Organizer: ${organizer.trim()}`);
    return parts.join(' · ');
  }, [meetingDate, location, organizer]);

  const generator = (
    <SummaryGeneratorButtonGroup
      onGenerateSummary={onGenerateSummary}
      onStopGeneration={onStopGeneration}
      onPublishToGithub={onPublishToGithub}
      isPublishing={isPublishing}
      summaryStatus={summaryStatus}
      availableTemplates={availableTemplates}
      selectedTemplate={selectedTemplate}
      onTemplateSelect={onTemplateSelect}
      hasTranscripts={transcripts.length > 0}
      hasSummary={!!aiSummary}
    />
  );

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-white overflow-hidden">
      <div className="p-4 border-b border-gray-200 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setTitleDialogOpen(true)}
              className="group flex items-center gap-2 text-left max-w-full"
              title="Edit title"
            >
              <h1 className="text-xl font-semibold text-gray-900 truncate">
                {meetingTitle || meeting.title || 'Untitled meeting'}
              </h1>
              <Pencil className="h-4 w-4 text-gray-400 opacity-0 group-hover:opacity-100 shrink-0" />
            </button>
            <button
              type="button"
              onClick={() => setDetailsDialogOpen(true)}
              className="mt-1 flex items-center gap-1.5 text-left text-sm text-gray-600 hover:text-gray-900 max-w-full"
              title="Edit date, location, organizer"
            >
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {detailsLine ? (
                <span className="truncate">{detailsLine}</span>
              ) : (
                <span className="text-gray-400 italic">Add date, location, organizer…</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setParticipantsDialogOpen(true)}
              className="mt-1 flex items-center gap-1.5 flex-wrap text-left text-sm text-gray-600 hover:text-gray-900"
              title="Edit participants"
            >
              <Users className="h-3.5 w-3.5 shrink-0" />
              {participants.length > 0 ? (
                <span className="flex flex-wrap gap-1">
                  {participants.map((p) => (
                    <span
                      key={p}
                      className="inline-flex px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs"
                    >
                      {p}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="text-gray-400 italic">Add participants…</span>
              )}
            </button>
            {speakerLabels.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setSpeakersDialogOpen(true)}
                  className="mt-1 flex items-center gap-1.5 flex-wrap text-left text-sm text-gray-600 hover:text-gray-900"
                  title="Rename speaker labels"
                >
                  <Tags className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex flex-wrap gap-1">
                    {speakerLabels.map((s) => {
                      const info = getSpeakerDisplayInfo(s);
                      return (
                        <span
                          key={s}
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-mono ${info.badgeColor}`}
                        >
                          {info.displayName}
                        </span>
                      );
                    })}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await onIdentifySpeakers();
                  }}
                  className="mt-1 flex items-center gap-1.5 text-left text-sm text-blue-600 hover:text-blue-900 font-medium"
                  title="Identify speakers using voice bank"
                >
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  <span>Identify Speakers</span>
                </button>
                {transcripts.some(t => t.person_id) && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (confirm('Clear all voice identifications? Speakers will revert to manual labels.')) {
                        await onClearIdentification();
                      }
                    }}
                    className="mt-1 flex items-center gap-1.5 text-left text-sm text-red-600 hover:text-red-900 font-medium"
                    title="Clear voice identifications and revert to manual labels"
                  >
                    <XCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>Clear Voice Identification</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {hasRecording && (
          <AudioPlayer meetingId={meeting.id} hasRecording={hasRecording} />
        )}

        {aiSummary && !isSummaryLoading && (
          <div className="flex items-center justify-center w-full pt-0 gap-2">
            <div className="flex-shrink-0">{generator}</div>
            <div className="flex-shrink-0">
              <SummaryUpdaterButtonGroup
                onCopy={onCopySummary}
                hasSummary={!!aiSummary}
                onSave={onSaveSummaryClick}
                isDirty={isSummaryDirty}
                isSaving={isSavingSummary}
              />
            </div>
          </div>
        )}
      </div>

      {isSummaryLoading ? (
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-center pt-8 pb-4">{generator}</div>
          <div className="flex items-center justify-center flex-1">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
              <p className="text-gray-600">
                {getSummaryStatusMessage(summaryStatus) || 'Generating AI Summary...'}
              </p>
            </div>
          </div>
        </div>
      ) : !aiSummary ? (
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-center gap-2 pt-8 pb-4">{generator}</div>
          <EmptyStateSummary
            onGenerate={onGenerateSummary}
            hasModel={true}
            isGenerating={isSummaryLoading}
            templateName={
              availableTemplates.find((t) => t.id === selectedTemplate)?.name
            }
          />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-6 w-full">
            <BlockNoteSummaryView
              ref={summaryRef}
              summaryData={aiSummary}
              onSave={onSaveSummary}
              onSummaryChange={onSummaryChange}
              onDirtyChange={onDirtyChange}
              status={summaryStatus}
              error={summaryError}
              onRegenerateSummary={() => {
                Analytics.trackButtonClick('regenerate_summary', 'meeting_details');
                onRegenerateSummary();
              }}
              meeting={{
                id: meeting.id,
                title: meetingTitle,
                created_at: meeting.created_at
              }}
            />
          </div>
          {summaryStatus !== 'idle' && (
            <div className={`mt-4 p-4 rounded-lg ${
              summaryStatus === 'error' ? 'bg-red-100 text-red-700' :
              summaryStatus === 'completed' ? 'bg-green-100 text-green-700' :
              'bg-blue-100 text-blue-700'
            }`}>
              <p className="text-sm font-medium">{getSummaryStatusMessage(summaryStatus)}</p>
            </div>
          )}
        </div>
      )}

      <EditTitleDialog
        open={titleDialogOpen}
        currentTitle={meetingTitle || meeting.title || ''}
        onSave={onSaveTitle}
        onCancel={() => setTitleDialogOpen(false)}
      />
      <EditParticipantsDialog
        open={participantsDialogOpen}
        participants={participants}
        onSave={onSaveParticipants}
        onCancel={() => setParticipantsDialogOpen(false)}
      />
      <EditMeetingDetailsDialog
        open={detailsDialogOpen}
        date={meetingDate}
        location={location}
        organizer={organizer}
        onSave={onSaveMeetingDetails}
        onCancel={() => setDetailsDialogOpen(false)}
      />
      <EditSpeakerLabelsDialog
        open={speakersDialogOpen}
        speakers={speakerLabels}
        transcripts={transcripts}
        personNames={personNames}
        onSave={onRenameSpeakers}
        onCancel={() => setSpeakersDialogOpen(false)}
      />
    </div>
  );
}

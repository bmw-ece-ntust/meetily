"use client";

import { Summary, Transcript } from '@/types';
import { BlockNoteSummaryView, BlockNoteSummaryViewRef } from '@/components/AISummary/BlockNoteSummaryView';
import { EmptyStateSummary } from '@/components/EmptyStateSummary';
import { SummaryGeneratorButtonGroup } from './SummaryGeneratorButtonGroup';
import { SummaryUpdaterButtonGroup } from './SummaryUpdaterButtonGroup';
import Analytics from '@/lib/analytics';
import { RefObject } from 'react';

interface SummaryPanelProps {
  meeting: {
    id: string;
    title: string;
    created_at: string;
  };
  meetingTitle: string;
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
  summaryError,
  onRegenerateSummary,
  getSummaryStatusMessage,
  availableTemplates,
  selectedTemplate,
  onTemplateSelect,
  onPublishToGithub,
  isPublishing = false,
}: SummaryPanelProps) {
  const isSummaryLoading = summaryStatus === 'processing' || summaryStatus === 'summarizing' || summaryStatus === 'regenerating';

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
      <div className="p-4 border-b border-gray-200">
        {aiSummary && !isSummaryLoading && (
          <div className="flex items-center justify-center w-full pt-0 gap-2">
            <div className="flex-shrink-0">{generator}</div>
            <div className="flex-shrink-0">
              <SummaryUpdaterButtonGroup
                onCopy={onCopySummary}
                hasSummary={!!aiSummary}
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
              <p className="text-gray-600">Generating AI Summary...</p>
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
    </div>
  );
}

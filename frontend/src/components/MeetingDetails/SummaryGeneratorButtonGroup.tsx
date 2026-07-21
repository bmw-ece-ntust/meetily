"use client";

import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sparkles, FileText, Check, Square, Github, Loader2 } from 'lucide-react';
import Analytics from '@/lib/analytics';

interface SummaryGeneratorButtonGroupProps {
  onGenerateSummary: () => Promise<void> | void;
  onStopGeneration: () => void;
  onPublishToGithub?: () => Promise<void> | void;
  isPublishing?: boolean;
  summaryStatus: 'idle' | 'processing' | 'summarizing' | 'regenerating' | 'completed' | 'error';
  availableTemplates: Array<{ id: string, name: string, description: string }>;
  selectedTemplate: string;
  onTemplateSelect: (templateId: string, templateName: string) => void;
  hasTranscripts?: boolean;
  hasSummary?: boolean;
}

export function SummaryGeneratorButtonGroup({
  onGenerateSummary,
  onStopGeneration,
  onPublishToGithub,
  isPublishing = false,
  summaryStatus,
  availableTemplates,
  selectedTemplate,
  onTemplateSelect,
  hasTranscripts = true,
  hasSummary = false,
}: SummaryGeneratorButtonGroupProps) {
  if (!hasTranscripts) return null;

  const isGenerating = summaryStatus === 'processing' || summaryStatus === 'summarizing' || summaryStatus === 'regenerating';

  return (
    <ButtonGroup>
      {isGenerating ? (
        <Button
          variant="outline"
          size="sm"
          className="bg-gradient-to-r from-red-50 to-orange-50 hover:from-red-100 hover:to-orange-100 border-red-200 xl:px-4"
          onClick={() => {
            Analytics.trackButtonClick('stop_summary_generation', 'meeting_details');
            onStopGeneration();
          }}
          title="Stop summary generation"
        >
          <Square className="xl:mr-2" size={18} fill="currentColor" />
          <span className="hidden lg:inline xl:inline">Stop</span>
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="bg-gradient-to-r from-blue-50 to-purple-50 hover:from-blue-100 hover:to-purple-100 border-blue-200 xl:px-4"
          onClick={() => {
            Analytics.trackButtonClick('generate_summary', 'meeting_details');
            onGenerateSummary();
          }}
          title={hasSummary ? 'Regenerate Summary' : 'Generate Summary'}
        >
          <Sparkles className="xl:mr-2" size={18} />
          <span className="hidden lg:inline xl:inline">{hasSummary ? 'Regenerate Summary' : 'Generate Summary'}</span>
        </Button>
      )}

      {availableTemplates.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" title="Select summary template">
              <FileText />
              <span className="hidden lg:inline">Template</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {availableTemplates.map((template) => (
              <DropdownMenuItem
                key={template.id}
                onClick={() => onTemplateSelect(template.id, template.name)}
                title={template.description}
                className="flex items-center justify-between gap-2"
              >
                <span>{template.name}</span>
                {selectedTemplate === template.id && <Check className="h-4 w-4 text-green-600" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {hasSummary && onPublishToGithub && !isGenerating && (
        <Button
          variant="outline"
          size="sm"
          className="border-gray-300 xl:px-4"
          disabled={isPublishing}
          onClick={() => {
            Analytics.trackButtonClick('publish_to_github', 'meeting_details');
            void onPublishToGithub();
          }}
          title="Publish meeting notes to GitHub"
        >
          {isPublishing ? (
            <Loader2 className="xl:mr-2 animate-spin" size={18} />
          ) : (
            <Github className="xl:mr-2" size={18} />
          )}
          <span className="hidden lg:inline xl:inline">
            {isPublishing ? 'Publishing...' : 'Publish to GitHub'}
          </span>
        </Button>
      )}
    </ButtonGroup>
  );
}

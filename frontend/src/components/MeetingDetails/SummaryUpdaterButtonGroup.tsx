"use client";

import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Copy, Save } from 'lucide-react';
import Analytics from '@/lib/analytics';

interface SummaryUpdaterButtonGroupProps {
  onCopy: () => Promise<void>;
  hasSummary: boolean;
  onSave?: () => Promise<void> | void;
  isDirty?: boolean;
  isSaving?: boolean;
}

export function SummaryUpdaterButtonGroup({
  onCopy,
  hasSummary,
  onSave,
  isDirty = false,
  isSaving = false,
}: SummaryUpdaterButtonGroupProps) {
  return (
    <ButtonGroup>
      {onSave && (
        <Button
          variant={isDirty ? 'default' : 'outline'}
          size="sm"
          title="Save Summary"
          onClick={() => {
            Analytics.trackButtonClick('save_summary', 'meeting_details');
            void onSave();
          }}
          disabled={!hasSummary || !isDirty || isSaving}
          className="cursor-pointer"
        >
          <Save />
          <span className="hidden lg:inline">{isSaving ? 'Saving…' : 'Save'}</span>
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        title="Copy Summary"
        onClick={() => {
          Analytics.trackButtonClick('copy_summary', 'meeting_details');
          onCopy();
        }}
        disabled={!hasSummary}
        className="cursor-pointer"
      >
        <Copy />
        <span className="hidden lg:inline">Copy</span>
      </Button>
    </ButtonGroup>
  );
}

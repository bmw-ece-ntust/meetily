"use client";

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import { Transcript } from '@/types';
import { Lock } from 'lucide-react';

interface EditSpeakerLabelsDialogProps {
  open: boolean;
  /** Unique speaker labels from the current transcript. */
  speakers: string[];
  /** Full transcript segments to check person_id */
  transcripts?: Transcript[];
  /** Voice bank person names mapping */
  personNames?: { [personId: string]: string };
  onSave: (mapping: Record<string, string>) => Promise<boolean> | boolean;
  onCancel: () => void;
}

export function EditSpeakerLabelsDialog({
  open,
  speakers,
  transcripts = [],
  personNames = {},
  onSave,
  onCancel,
}: EditSpeakerLabelsDialogProps) {
  const unique = useMemo(
    () =>
      Array.from(
        new Set(speakers.map((s) => s.trim()).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b)),
    [speakers]
  );

  // Check if a speaker is identified and locked (non-Guest)
  const isLocked = (speaker: string): boolean => {
    const segment = transcripts.find((t) => t.speaker === speaker && t.person_id);
    if (!segment?.person_id) return false;
    const personName = personNames[segment.person_id];
    return !!personName && !personName.startsWith('Guest-');
  };

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const init: Record<string, string> = {};
      for (const s of unique) init[s] = s;
      setDraft(init);
    }
  }, [open, unique]);

  const handleSave = async () => {
    const mapping: Record<string, string> = {};
    for (const [oldLabel, newLabel] of Object.entries(draft)) {
      const next = newLabel.trim();
      if (!next) continue;
      if (next !== oldLabel) mapping[oldLabel] = next;
    }
    if (Object.keys(mapping).length === 0) {
      onCancel();
      return;
    }
    setSaving(true);
    try {
      const ok = await onSave(mapping);
      if (ok !== false) onCancel();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
      <DialogContent className="sm:max-w-[520px]">
        <VisuallyHidden>
          <DialogTitle>Rename Speakers</DialogTitle>
        </VisuallyHidden>
        <div className="py-2">
          <h3 className="text-lg font-semibold mb-1">Rename Speakers</h3>
          <p className="text-sm text-gray-500 mb-4">
            Bulk-rename diarization labels on the latest transcript (e.g. SPEAKER_00 → Alice).
          </p>
          {unique.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No speaker labels in this transcript.</p>
          ) : (
            <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
              {unique.map((label) => {
                const locked = isLocked(label);
                const segment = transcripts.find(t => t.speaker === label);
                const currentDisplay = segment?.display_name;
                
                return (
                  <div key={label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <div className="text-sm font-mono text-gray-600 truncate" title={label}>
                      {label}
                      {currentDisplay && currentDisplay !== label && (
                        <span className="text-xs text-gray-500 block">
                          → {currentDisplay}
                        </span>
                      )}
                    </div>
                    <span className="text-gray-400 text-sm">→</span>
                    <div className="relative">
                      <input
                        type="text"
                        value={draft[label] ?? ''}
                        onChange={(e) =>
                          setDraft((prev) => ({ ...prev, [label]: e.target.value }))
                        }
                        disabled={locked}
                        className={`w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          locked ? 'bg-gray-100 cursor-not-allowed text-gray-500' : ''
                        }`}
                        placeholder="New name"
                        title={locked ? 'Cannot rename identified speakers (use Clear Voice Identification first)' : undefined}
                      />
                      {locked && (
                        <Lock className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || unique.length === 0}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useEffect, useState, KeyboardEvent } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import { X } from 'lucide-react';

interface EditParticipantsDialogProps {
  open: boolean;
  participants: string[];
  onSave: (participants: string[]) => Promise<boolean> | boolean;
  onCancel: () => void;
}

export function EditParticipantsDialog({
  open,
  participants,
  onSave,
  onCancel,
}: EditParticipantsDialogProps) {
  const [names, setNames] = useState<string[]>(participants);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setNames(participants);
      setDraft('');
    }
  }, [open, participants]);

  const addName = (raw: string) => {
    const parts = raw
      .split(/[,;\n]/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (!parts.length) return;
    setNames((prev) => {
      const next = [...prev];
      for (const p of parts) {
        if (!next.some((n) => n.toLowerCase() === p.toLowerCase())) {
          next.push(p);
        }
      }
      return next;
    });
    setDraft('');
  };

  const removeName = (index: number) => {
    setNames((prev) => prev.filter((_, i) => i !== index));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addName(draft);
    } else if (e.key === 'Backspace' && !draft && names.length) {
      removeName(names.length - 1);
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  const handleSave = async () => {
    const merged = draft.trim()
      ? [...names, ...draft.split(/[,;\n]/).map((p) => p.trim()).filter(Boolean)]
      : names;
    const unique: string[] = [];
    for (const n of merged) {
      if (!unique.some((u) => u.toLowerCase() === n.toLowerCase())) unique.push(n);
    }
    setSaving(true);
    try {
      const ok = await onSave(unique);
      if (ok !== false) onCancel();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
      <DialogContent className="sm:max-w-[480px]">
        <VisuallyHidden>
          <DialogTitle>Edit Participants</DialogTitle>
        </VisuallyHidden>
        <div className="py-2">
          <h3 className="text-lg font-semibold mb-1">Edit Participants</h3>
          <p className="text-sm text-gray-500 mb-4">
            Used when generating Meeting Notes / summaries so the AI knows who attended.
          </p>
          <div className="min-h-[44px] flex flex-wrap gap-2 p-2 border border-gray-300 rounded-md focus-within:ring-2 focus-within:ring-blue-500">
            {names.map((name, i) => (
              <span
                key={`${name}-${i}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 text-sm"
              >
                {name}
                <button
                  type="button"
                  onClick={() => removeName(i)}
                  className="hover:text-blue-950"
                  aria-label={`Remove ${name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={() => { if (draft.trim()) addName(draft); }}
              className="flex-1 min-w-[120px] outline-none text-sm py-1"
              placeholder={names.length ? 'Add another…' : 'Type a name, press Enter'}
              autoFocus
            />
          </div>
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
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

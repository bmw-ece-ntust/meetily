"use client";

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { VisuallyHidden } from '@/components/ui/visually-hidden';

interface EditTitleDialogProps {
  open: boolean;
  currentTitle: string;
  onSave: (title: string) => Promise<boolean> | boolean;
  onCancel: () => void;
}

export function EditTitleDialog({
  open,
  currentTitle,
  onSave,
  onCancel,
}: EditTitleDialogProps) {
  const [title, setTitle] = useState(currentTitle);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setTitle(currentTitle);
  }, [open, currentTitle]);

  const handleSave = async () => {
    const next = title.trim();
    if (!next) return;
    setSaving(true);
    try {
      const ok = await onSave(next);
      if (ok !== false) onCancel();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
      <DialogContent className="sm:max-w-[425px]">
        <VisuallyHidden>
          <DialogTitle>Edit Meeting Title</DialogTitle>
        </VisuallyHidden>
        <div className="py-4">
          <h3 className="text-lg font-semibold mb-4">Edit Meeting Title</h3>
          <label htmlFor="meeting-title-edit" className="block text-sm font-medium text-gray-700 mb-2">
            Meeting Title
          </label>
          <input
            id="meeting-title-edit"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSave();
              else if (e.key === 'Escape') onCancel();
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter meeting title"
            autoFocus
          />
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
            disabled={saving || !title.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import { toast } from 'sonner';
import { voiceBankApiService } from '@/services/voiceBankApiService';
import { FileAudio, X } from 'lucide-react';

type AudioFileInfo = {
  path: string;
  filename: string;
  duration_seconds?: number | null;
};

interface AddPersonDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function AddPersonDialog({ open, onClose, onCreated }: AddPersonDialogProps) {
  const [name, setName] = useState('');
  const [aliasesText, setAliasesText] = useState('');
  const [fileInfo, setFileInfo] = useState<AudioFileInfo | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setAliasesText('');
      setFileInfo(null);
      setSaving(false);
    }
  }, [open]);

  const parseAliases = (raw: string): string[] =>
    raw
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);

  const pickFile = async () => {
    try {
      const result = await invoke<AudioFileInfo | null>('select_and_validate_audio_command');
      if (result) setFileInfo(result);
    } catch (err) {
      toast.error('Failed to select audio', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    try {
      const person = await voiceBankApiService.createPerson(trimmed, parseAliases(aliasesText));
      if (fileInfo?.path) {
        try {
          await voiceBankApiService.addSample(person.id, fileInfo.path, {
            duration_s: fileInfo.duration_seconds ?? undefined,
          });
          toast.success(`Created ${person.name}`, {
            description: 'Sample uploaded; voiceprint rebuild attempted (≥30s total needed).',
          });
        } catch (sampleErr) {
          toast.success(`Created ${person.name}`, {
            description: `Sample upload failed: ${
              sampleErr instanceof Error ? sampleErr.message : String(sampleErr)
            }`,
          });
        }
      } else {
        toast.success(`Created ${person.name}`, {
          description: 'Add a ≥30s sample later for auto-ID.',
        });
      }
      onCreated();
      onClose();
    } catch (err) {
      toast.error('Failed to create person', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="sm:max-w-[480px]">
        <VisuallyHidden>
          <DialogTitle>Add person</DialogTitle>
        </VisuallyHidden>
        <div className="py-2 space-y-4">
          <div>
            <h3 className="text-lg font-semibold mb-1">Add person</h3>
            <p className="text-sm text-gray-500">
              Name is enough to create. Optional enrollment audio enables voiceprint match
              (need ~30s total speech for a centroid).
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Alice"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Aliases <span className="text-gray-400 font-normal">(optional, comma-separated)</span>
            </label>
            <input
              type="text"
              value={aliasesText}
              onChange={(e) => setAliasesText(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Alicia, A."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Enrollment audio <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            {fileInfo ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-violet-50 border border-violet-100 rounded-md text-sm">
                <FileAudio className="w-4 h-4 text-violet-600 shrink-0" />
                <span className="flex-1 truncate text-violet-900" title={fileInfo.path}>
                  {fileInfo.filename}
                  {fileInfo.duration_seconds != null &&
                    ` · ${Math.round(fileInfo.duration_seconds)}s`}
                </span>
                <button
                  type="button"
                  onClick={() => setFileInfo(null)}
                  className="p-1 text-violet-600 hover:text-violet-900"
                  aria-label="Clear file"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void pickFile()}
                className="w-full px-3 py-2 border border-dashed border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50"
              >
                Choose audio file…
              </button>
            )}
          </div>
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !name.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Create'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

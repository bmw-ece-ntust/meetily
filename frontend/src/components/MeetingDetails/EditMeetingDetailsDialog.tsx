"use client";

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { VisuallyHidden } from '@/components/ui/visually-hidden';

interface EditMeetingDetailsDialogProps {
  open: boolean;
  date: string | null;
  location: string | null;
  organizer: string | null;
  onSave: (fields: {
    date?: string | null;
    location?: string | null;
    organizer?: string | null;
  }) => Promise<boolean> | boolean;
  onCancel: () => void;
}

/** Convert ISO/RFC3339 string to `datetime-local` input value (local timezone). */
function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Convert `datetime-local` value to RFC3339 UTC. */
function fromDatetimeLocalValue(local: string): string | null {
  if (!local.trim()) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function EditMeetingDetailsDialog({
  open,
  date,
  location,
  organizer,
  onSave,
  onCancel,
}: EditMeetingDetailsDialogProps) {
  const [dateLocal, setDateLocal] = useState(toDatetimeLocalValue(date));
  const [loc, setLoc] = useState(location ?? '');
  const [org, setOrg] = useState(organizer ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDateLocal(toDatetimeLocalValue(date));
      setLoc(location ?? '');
      setOrg(organizer ?? '');
    }
  }, [open, date, location, organizer]);

  const handleSave = async () => {
    const nextDate = fromDatetimeLocalValue(dateLocal);
    setSaving(true);
    try {
      const ok = await onSave({
        date: nextDate,
        location: loc.trim() || '',
        organizer: org.trim() || '',
      });
      if (ok !== false) onCancel();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
      <DialogContent className="sm:max-w-[480px]">
        <VisuallyHidden>
          <DialogTitle>Edit Meeting Details</DialogTitle>
        </VisuallyHidden>
        <div className="py-2 space-y-4">
          <div>
            <h3 className="text-lg font-semibold mb-1">Edit Meeting Details</h3>
            <p className="text-sm text-gray-500">
              Date/time, location, and organizer. Clear a field to remove it.
            </p>
          </div>
          <div>
            <label htmlFor="meeting-date-edit" className="block text-sm font-medium text-gray-700 mb-1">
              Date &amp; time
            </label>
            <input
              id="meeting-date-edit"
              type="datetime-local"
              value={dateLocal}
              onChange={(e) => setDateLocal(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="meeting-location-edit" className="block text-sm font-medium text-gray-700 mb-1">
              Location
            </label>
            <input
              id="meeting-location-edit"
              type="text"
              value={loc}
              onChange={(e) => setLoc(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Conference room, Zoom link…"
            />
          </div>
          <div>
            <label htmlFor="meeting-organizer-edit" className="block text-sm font-medium text-gray-700 mb-1">
              Organizer
            </label>
            <input
              id="meeting-organizer-edit"
              type="text"
              value={org}
              onChange={(e) => setOrg(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSave();
                else if (e.key === 'Escape') onCancel();
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Who organized this meeting"
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

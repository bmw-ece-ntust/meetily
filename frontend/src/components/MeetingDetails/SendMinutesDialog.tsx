"use client";

import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Calendar, CheckCircle, Loader2, Mail, MailWarning } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import { toast } from 'sonner';

type CommandResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

type GoogleStatus = {
  enabled: boolean;
  configured: boolean;
  accounts: Array<{ google_email: string }>;
};

type EventAttendee = {
  email: string;
  display_name?: string | null;
  organizer: boolean;
};

type MeetingEventResponse = {
  linked: boolean;
  google_email?: string | null;
  event?: {
    id: string;
    title: string;
    start?: string | null;
    end?: string | null;
    attendees: EventAttendee[];
  } | null;
  already_sent: boolean;
};

interface SendMinutesDialogProps {
  open: boolean;
  meetingId: string;
  meetingTitle: string;
  onClose: () => void;
}

export function SendMinutesDialog({
  open,
  meetingId,
  meetingTitle,
  onClose,
}: SendMinutesDialogProps) {
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [result, setResult] = useState<MeetingEventResponse | null>(null);
  const [manualEmails, setManualEmails] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setResult(null);
    setSelected(new Set());
    try {
      const statusResult = await invoke<CommandResult<GoogleStatus>>('get_google_status');
      if (!statusResult.success || !statusResult.data) {
        throw new Error(statusResult.error || 'Failed to load Google status');
      }
      const emails = statusResult.data.accounts.map((a) => a.google_email);
      setAccounts(emails);
      if (!statusResult.data.enabled || emails.length === 0) return;

      const findResult = await invoke<CommandResult<MeetingEventResponse>>('google_find_event', {
        meetingId,
      });
      if (!findResult.success || !findResult.data) {
        throw new Error(findResult.error || 'Failed to search calendar');
      }
      const found = findResult.data;
      setResult(found);
      if (found.event) {
        setSelected(new Set(found.event.attendees.map((a) => a.email)));
        setSubject(`Minutes: ${found.event.title}`);
      } else {
        setSubject(`Minutes: ${meetingTitle || 'Meeting'}`);
      }
    } catch (error) {
      toast.error('Failed to prepare send dialog', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  }, [meetingId, meetingTitle]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const toggle = (email: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const handleSend = async () => {
    const extra = manualEmails
      .split(/[,\s]+/)
      .map((e) => e.trim())
      .filter((e) => e.includes('@'));
    const recipients = [...new Set([...selected, ...extra])];
    if (recipients.length === 0) {
      toast.error('Select at least one recipient');
      return;
    }

    setSending(true);
    try {
      const sendResult = await invoke<CommandResult<{ outcome: string }>>(
        'google_send_minutes',
        {
          meetingId,
          recipients,
          subject: subject.trim() || null,
        }
      );
      if (!sendResult.success || !sendResult.data) {
        throw new Error(sendResult.error || 'Send failed');
      }
      const outcome = sendResult.data.outcome;
      if (outcome.startsWith('sent:')) {
        toast.success(`Minutes sent to ${outcome.slice(5)} recipient(s)`);
        onClose();
      } else if (outcome.startsWith('failed:')) {
        throw new Error(outcome.slice(7));
      } else {
        const reasons: Record<string, string> = {
          'skipped:already_sent': 'Minutes were already emailed for this meeting.',
          'skipped:no_calendar_event': 'No calendar event found for this meeting.',
          'skipped:empty_summary': 'Summary is empty — nothing to send.',
        };
        toast.info('Not sent', { description: reasons[outcome] || outcome });
      }
    } catch (error) {
      toast.error('Failed to send minutes', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSending(false);
    }
  };

  const formatTime = (value?: string | null) => {
    if (!value) return '';
    try {
      return new Date(value).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return value;
    }
  };

  const event = result?.event ?? null;
  const alreadySent = result?.already_sent ?? false;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="sm:max-w-[520px]">
        <VisuallyHidden>
          <DialogTitle>Send Minutes to Attendees</DialogTitle>
        </VisuallyHidden>
        <div className="py-4 space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Mail className="h-5 w-5 text-gray-500" />
            Send Minutes to Attendees
          </h3>

          {loading ? (
            <div className="flex items-center justify-center py-8 text-gray-500">
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Checking your Google Calendar…
            </div>
          ) : accounts.length === 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
              <MailWarning className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">No Google account connected on the server</p>
                <p className="mt-1">
                  Connect one in Settings → Google Calendar &amp; Gmail first.
                </p>
              </div>
            </div>
          ) : (
            <>
              {alreadySent && (
                <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  Minutes for this meeting were already emailed.
                </div>
              )}

              <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
                {event ? (
                  <div className="flex items-start gap-2">
                    <Calendar className="h-4 w-4 mt-0.5 text-gray-500 shrink-0" />
                    <div>
                      <p className="font-medium text-gray-900">{event.title}</p>
                      {event.start && (
                        <p className="text-gray-500 text-xs mt-0.5">
                          {formatTime(event.start)}
                          {event.end ? ` – ${formatTime(event.end)}` : ''}
                        </p>
                      )}
                      {result?.google_email && (
                        <p className="text-gray-400 text-xs mt-0.5">
                          via {result.google_email}&apos;s calendar
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-600">
                    No calendar event found overlapping this meeting&apos;s time. Add recipients
                    manually below.
                  </p>
                )}
              </div>

              {event && event.attendees.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">
                    Attendees ({selected.size} of {event.attendees.length} selected)
                  </p>
                  <div className="max-h-48 overflow-y-auto rounded-md border border-gray-200 divide-y divide-gray-100">
                    {event.attendees.map((a) => (
                      <label
                        key={a.email}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(a.email)}
                          onChange={() => toggle(a.email)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600"
                        />
                        <span className="text-sm text-gray-800">
                          {a.display_name ? `${a.display_name} ` : ''}
                          <span className="text-gray-500">&lt;{a.email}&gt;</span>
                          {a.organizer && (
                            <span className="ml-2 text-xs text-gray-400">(organizer)</span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label htmlFor="send-minutes-extra" className="text-sm font-medium text-gray-700">
                  Additional recipients (comma separated, optional)
                </label>
                <input
                  id="send-minutes-extra"
                  type="text"
                  value={manualEmails}
                  onChange={(e) => setManualEmails(e.target.value)}
                  placeholder="someone@example.com, other@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="send-minutes-subject" className="text-sm font-medium text-gray-700">
                  Subject
                </label>
                <input
                  id="send-minutes-subject"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <p className="text-xs text-gray-500">
                The server emails the minutes as a Markdown (.md) attachment.
              </p>
            </>
          )}
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={
              sending ||
              loading ||
              accounts.length === 0 ||
              alreadySent ||
              (selected.size === 0 && !manualEmails.trim())
            }
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {sending && <Loader2 className="w-4 h-4 animate-spin" />}
            {sending ? 'Sending…' : 'Send'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BadgeCheck,
  Bot,
  Calendar,
  Loader2,
  MailCheck,
  RefreshCw,
  Users,
  Video,
} from 'lucide-react';

type CommandResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

type ListedEvent = {
  google_email: string;
  teams_url?: string | null;
  bot_id?: string | null;
  meeting_id?: string | null;
  dispatched_at?: string | null;
  minutes_sent: boolean;
  event: {
    id: string;
    title: string;
    start?: string | null;
    end?: string | null;
    attendees: Array<{ email: string; display_name?: string | null }>;
  };
};

function dayLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return 'Today';
  if (sameDay(date, tomorrow)) return 'Tomorrow';
  if (sameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function timeRange(start?: string | null, end?: string | null): string {
  if (!start) return 'All day';
  const s = new Date(start);
  const fmt = (d: Date) =>
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return end ? `${fmt(s)} – ${fmt(new Date(end))}` : fmt(s);
}

export default function CalendarPage() {
  const router = useRouter();
  const [events, setEvents] = useState<ListedEvent[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (all: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<CommandResult<ListedEvent[]>>('google_list_events', {
        daysBefore: 7,
        daysAfter: 7,
        all,
      });
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to load calendar events');
      }
      setEvents(result.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(showAll);
  }, [showAll, load]);

  // Group events by day label, preserving server sort.
  const groups = events.reduce<Array<{ label: string; items: ListedEvent[] }>>(
    (acc, item) => {
      const label = item.event.start ? dayLabel(item.event.start) : 'No date';
      const last = acc[acc.length - 1];
      if (last && last.label === label) last.items.push(item);
      else acc.push({ label, items: [item] });
      return acc;
    },
    []
  );

  return (
    <div className="h-screen bg-gray-50 flex flex-col">
      <div className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.back()}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                <span>Back</span>
              </button>
              <h1 className="text-2xl font-bold">Calendar</h1>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAll}
                  onChange={(e) => setShowAll(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                />
                Show all events
              </label>
              <button
                onClick={() => void load(showAll)}
                disabled={loading}
                className="p-2 rounded-lg hover:bg-gray-200 transition-colors"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-8 pt-4 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-500">
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Loading calendar events…
            </div>
          ) : error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
              <p className="mt-1 text-xs">
                Check that a Google account is connected in Settings → Google Calendar &amp; Gmail.
              </p>
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <Calendar className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p>No {showAll ? '' : 'Teams '}events in the next or past 7 days.</p>
              {!showAll && (
                <p className="text-sm mt-1">
                  Enable &quot;Show all events&quot; to see events without a Teams link.
                </p>
              )}
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.label}>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {group.label}
                </h2>
                <div className="space-y-2">
                  {group.items.map((item) => {
                    const clickable = Boolean(item.meeting_id);
                    return (
                      <button
                        key={`${item.google_email}:${item.event.id}`}
                        type="button"
                        disabled={!clickable}
                        onClick={() =>
                          item.meeting_id &&
                          router.push(`/meeting-details?id=${item.meeting_id}`)
                        }
                        className={`w-full text-left rounded-lg border border-gray-200 bg-white px-4 py-3 transition-colors ${
                          clickable ? 'hover:border-blue-300 hover:shadow-sm cursor-pointer' : 'cursor-default'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-gray-900 truncate">
                                {item.event.title}
                              </span>
                              {item.teams_url && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-xs">
                                  <Video className="w-3 h-3" />
                                  Teams
                                </span>
                              )}
                              {item.bot_id && (
                                <span
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-xs"
                                  title={item.dispatched_at ? `Bot dispatched ${item.dispatched_at}` : 'Bot dispatched'}
                                >
                                  <Bot className="w-3 h-3" />
                                  Bot joined
                                </span>
                              )}
                              {item.minutes_sent && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-50 text-green-700 text-xs">
                                  <MailCheck className="w-3 h-3" />
                                  Minutes sent
                                </span>
                              )}
                              {item.meeting_id && !item.minutes_sent && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-xs">
                                  <BadgeCheck className="w-3 h-3" />
                                  Linked
                                </span>
                              )}
                            </div>
                            <div className="mt-1 flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                              <span>{timeRange(item.event.start, item.event.end)}</span>
                              {item.event.attendees.length > 0 && (
                                <span className="inline-flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  {item.event.attendees.length} attendee
                                  {item.event.attendees.length === 1 ? '' : 's'}
                                </span>
                              )}
                              <span className="text-gray-400">{item.google_email}</span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Video } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useJobQueue } from '@/contexts/JobQueueContext';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import Analytics from '@/lib/analytics';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Starts a meeting bot via the agent API, then tracks progress in the
 * background job queue (ProcessingJobsIndicator). Dialog can be closed
 * immediately after Start — join/record/transcribe continues in the background.
 */
export function JoinMeetingDialog({ open, onOpenChange }: Props) {
  const router = useRouter();
  const { enqueueBot } = useJobQueue();
  const { setCurrentMeeting, refetchMeetings } = useSidebar();

  const [meetingUrl, setMeetingUrl] = useState('');
  const [title, setTitle] = useState('');
  const [botName, setBotName] = useState('BMW-Lab-Bot');
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setMeetingUrl('');
    setTitle('');
    setBotName('BMW-Lab-Bot');
    setSubmitting(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      // Closing does not cancel the bot — job queue keeps tracking.
      resetForm();
    }
    onOpenChange(next);
  };

  const handleStart = () => {
    const url = meetingUrl.trim();
    if (!url) {
      toast.error('Paste a Teams meeting link');
      return;
    }

    setSubmitting(true);
    Analytics.trackButtonClick('join_meeting_start', 'join_dialog');

    const meetingTitle = title.trim() || 'Teams meeting';

    enqueueBot({
      meetingUrl: url,
      platform: 'teams',
      title: meetingTitle,
      botName: botName.trim() || undefined,
      onComplete: async (meetingId, result) => {
        try {
          await refetchMeetings();
        } catch {
          /* ignore */
        }
        const t = result?.title || meetingTitle;
        setCurrentMeeting({ id: meetingId, title: t });
        router.push(`/meeting-details?id=${meetingId}`);
      },
      onError: (error) => {
        console.warn('[JoinMeeting] background job error:', error);
      },
    });

    toast.success('Bot started in background', {
      description: 'Admit the bot in the Teams lobby if asked. Track progress in the job list.',
    });

    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5 text-blue-600" />
            Join meeting with bot
          </DialogTitle>
          <DialogDescription>
            Starts a bot on your AI server. You can close this dialog right after Start — the bot
            keeps joining and recording in the background. Open the job list (bottom) for status or
            to stop.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="meeting-url">Teams meeting link</Label>
            <Input
              id="meeting-url"
              placeholder="https://teams.microsoft.com/l/meetup-join/…"
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="meeting-title">Title (optional)</Label>
            <Input
              id="meeting-title"
              placeholder="Lab standup"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="bot-name">Bot display name</Label>
            <Input
              id="bot-name"
              value={botName}
              onChange={(e) => setBotName(e.target.value)}
              disabled={submitting}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleStart} disabled={submitting || !meetingUrl.trim()}>
            Start in background
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { MeetingAudioPlayer } from '@/components/MeetingAudioPlayer';

interface AudioPlayerProps {
  meetingId: string;
  hasRecording?: boolean;
  className?: string;
}

/** @deprecated Prefer MeetingAudioPlayer. Thin re-export for legacy imports. */
export function AudioPlayer(props: AudioPlayerProps) {
  return <MeetingAudioPlayer {...props} />;
}

export type Person = {
  id: string;
  name: string;
  aliases: string[];
  created_at: string;
  updated_at: string;
};

export type VoiceprintSample = {
  id: string;
  person_id: string;
  voiceprint_id?: string | null;
  audio_path: string;
  duration_s: number;
  source: string;
  meeting_id?: string | null;
  segment_ids?: number[];
  created_at: string;
};

export type VoiceprintMeta = {
  id: string;
  person_id: string;
  model: string;
  dim: number;
  enrolled_from: string;
  created_at: string;
  updated_at: string;
};

export type RebuildVoiceprintResult = {
  rebuilt: boolean;
  voiceprint?: VoiceprintMeta | null;
  message?: string | null;
};

export type SpeakerIdentity = {
  diar_label: string;
  display_name: string;
  person_id?: string | null;
  confidence?: number | null;
  speech_s: number;
};

export type IdentifySpeakersResult = {
  meeting_id: string;
  updated_segments: number;
  matched: number;
  guests: number;
  skipped: number;
  identities: SpeakerIdentity[];
};

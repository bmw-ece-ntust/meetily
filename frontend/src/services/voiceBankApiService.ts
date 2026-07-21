import { invoke } from '@tauri-apps/api/core';
import type {
  IdentifySpeakersResult,
  Person,
  RebuildVoiceprintResult,
  VoiceprintMeta,
  VoiceprintSample,
} from '@/types/voiceBank';

type CommandResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

async function unwrap<T>(promise: Promise<CommandResult<T>>, fallback: string): Promise<T> {
  const result = await promise;
  if (!result.success || result.data === undefined) {
    throw new Error(result.error || fallback);
  }
  return result.data;
}

export const voiceBankApiService = {
  async listPersons(): Promise<Person[]> {
    const data = await unwrap<{ persons: Person[]; total: number }>(
      invoke('list_persons'),
      'Failed to list persons'
    );
    return data.persons ?? [];
  },

  async createPerson(name: string, aliases: string[] = []): Promise<Person> {
    return unwrap(
      invoke('create_person', { name, aliases }),
      'Failed to create person'
    );
  },

  async getPerson(id: string): Promise<Person> {
    return unwrap(invoke('get_person', { id }), 'Failed to get person');
  },

  async updatePerson(
    id: string,
    fields: { name?: string; aliases?: string[] }
  ): Promise<Person> {
    return unwrap(
      invoke('update_person', {
        id,
        name: fields.name ?? null,
        aliases: fields.aliases ?? null,
      }),
      'Failed to update person'
    );
  },

  async deletePerson(id: string): Promise<void> {
    await unwrap<boolean>(invoke('delete_person', { id }), 'Failed to delete person');
  },

  async listSamples(personId: string): Promise<VoiceprintSample[]> {
    const data = await unwrap<{ samples: VoiceprintSample[]; total: number }>(
      invoke('list_person_samples', { personId }),
      'Failed to list samples'
    );
    return data.samples ?? [];
  },

  async addSample(
    personId: string,
    filePath: string,
    opts?: { duration_s?: number; meeting_id?: string }
  ): Promise<VoiceprintSample> {
    return unwrap(
      invoke('add_person_sample', {
        personId,
        filePath,
        durationS: opts?.duration_s ?? null,
        meetingId: opts?.meeting_id ?? null,
      }),
      'Failed to add sample'
    );
  },

  async deleteSample(personId: string, sampleId: string): Promise<void> {
    await unwrap<boolean>(
      invoke('delete_person_sample', { personId, sampleId }),
      'Failed to delete sample'
    );
  },

  async rebuildVoiceprint(personId: string): Promise<RebuildVoiceprintResult> {
    return unwrap(
      invoke('rebuild_person_voiceprint', { personId }),
      'Failed to rebuild voiceprint'
    );
  },

  async listVoiceprints(): Promise<VoiceprintMeta[]> {
    const data = await unwrap<{ voiceprints: VoiceprintMeta[]; total: number }>(
      invoke('list_voiceprints'),
      'Failed to list voiceprints'
    );
    return data.voiceprints ?? [];
  },

  async identifySpeakers(meetingId: string): Promise<IdentifySpeakersResult> {
    return unwrap(
      invoke('identify_meeting_speakers', { id: meetingId }),
      'Failed to identify speakers'
    );
  },
};

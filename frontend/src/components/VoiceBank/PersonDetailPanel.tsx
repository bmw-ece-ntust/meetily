"use client";

import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { voiceBankApiService } from '@/services/voiceBankApiService';
import type { Person, VoiceprintMeta, VoiceprintSample } from '@/types/voiceBank';
import { ArrowLeft, RefreshCw, Trash2, Upload } from 'lucide-react';

type AudioFileInfo = {
  path: string;
  filename: string;
  duration_seconds?: number | null;
};

interface PersonDetailPanelProps {
  personId: string;
  enrolled: boolean;
  onBack: () => void;
  onChanged: () => void;
}

export function PersonDetailPanel({
  personId,
  enrolled,
  onBack,
  onChanged,
}: PersonDetailPanelProps) {
  const [person, setPerson] = useState<Person | null>(null);
  const [samples, setSamples] = useState<VoiceprintSample[]>([]);
  const [voiceprint, setVoiceprint] = useState<VoiceprintMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, s, vps] = await Promise.all([
        voiceBankApiService.getPerson(personId),
        voiceBankApiService.listSamples(personId),
        voiceBankApiService.listVoiceprints(),
      ]);
      setPerson(p);
      setSamples(s);
      setVoiceprint(vps.find((v) => v.person_id === personId) ?? null);
    } catch (err) {
      toast.error('Failed to load person', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }, [personId]);

  useEffect(() => {
    void load();
  }, [load]);

  const uploadSample = async () => {
    try {
      const file = await invoke<AudioFileInfo | null>('select_and_validate_audio_command');
      if (!file?.path) return;
      setBusy(true);
      await voiceBankApiService.addSample(personId, file.path, {
        duration_s: file.duration_seconds ?? undefined,
      });
      toast.success('Sample uploaded');
      await load();
      onChanged();
    } catch (err) {
      toast.error('Upload failed', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const rebuild = async () => {
    setBusy(true);
    try {
      const result = await voiceBankApiService.rebuildVoiceprint(personId);
      if (result.rebuilt) {
        toast.success('Voiceprint rebuilt');
      } else {
        toast.message('No centroid yet', {
          description: result.message || 'Need ≥30s total enrolled speech.',
        });
      }
      await load();
      onChanged();
    } catch (err) {
      toast.error('Rebuild failed', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const deleteSample = async (sampleId: string) => {
    if (!confirm('Delete this enrollment sample?')) return;
    setBusy(true);
    try {
      await voiceBankApiService.deleteSample(personId, sampleId);
      toast.success('Sample deleted');
      await load();
      onChanged();
    } catch (err) {
      toast.error('Delete failed', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const deletePerson = async () => {
    if (!person) return;
    if (!confirm(`Delete ${person.name} and all samples? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await voiceBankApiService.deletePerson(personId);
      toast.success(`Deleted ${person.name}`);
      onChanged();
      onBack();
    } catch (err) {
      toast.error('Delete failed', {
        description: err instanceof Error ? err.message : String(err),
      });
      setBusy(false);
    }
  };

  if (loading || !person) {
    return (
      <div className="p-6 text-sm text-gray-500">
        {loading ? 'Loading…' : 'Person not found'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to list
      </button>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{person.name}</h2>
          {person.aliases?.length > 0 && (
            <p className="text-sm text-gray-500 mt-1">
              Aliases: {person.aliases.join(', ')}
            </p>
          )}
          <p className="text-xs text-gray-400 mt-2 font-mono">{person.id}</p>
          <div className="mt-2">
            {voiceprint || enrolled ? (
              <span className="inline-flex px-2 py-0.5 rounded-full bg-green-50 text-green-800 text-xs font-medium">
                Enrolled · {voiceprint?.model ?? 'voiceprint'}
              </span>
            ) : (
              <span className="inline-flex px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 text-xs font-medium">
                Name only · no voiceprint yet
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void deletePerson()}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-700 bg-red-50 hover:bg-red-100 rounded-md disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" />
          Delete
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void uploadSample()}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
        >
          <Upload className="w-4 h-4" />
          Upload sample
        </button>
        <button
          type="button"
          onClick={() => void rebuild()}
          disabled={busy || samples.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md disabled:opacity-50"
        >
          <RefreshCw className="w-4 h-4" />
          Rebuild voiceprint
        </button>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          Samples ({samples.length})
        </h3>
        {samples.length === 0 ? (
          <p className="text-sm text-gray-400 italic">
            No samples. Upload ≥30s of speech for auto-ID.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg bg-white">
            {samples.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-mono text-xs text-gray-500 truncate" title={s.audio_path}>
                    {s.audio_path.split('/').pop()}
                  </p>
                  <p className="text-gray-600 mt-0.5">
                    {s.duration_s > 0 ? `${s.duration_s.toFixed(1)}s` : 'duration unknown'} ·{' '}
                    {s.source}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void deleteSample(s.id)}
                  disabled={busy}
                  className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-50"
                  aria-label="Delete sample"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

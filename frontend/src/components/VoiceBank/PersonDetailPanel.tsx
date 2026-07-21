"use client";

import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { voiceBankApiService } from '@/services/voiceBankApiService';
import type { Person, VoiceprintMeta, VoiceprintSample } from '@/types/voiceBank';
import { ArrowLeft, Edit2, Play, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import { SampleAudioPlayer } from './SampleAudioPlayer';

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
  const [playingSampleId, setPlayingSampleId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

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
      setNameInput(p.name);
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

  const startEditName = () => {
    if (!person) return;
    setNameInput(person.name);
    setEditingName(true);
  };

  const cancelEditName = () => {
    setEditingName(false);
    setNameInput(person?.name || '');
  };

  const saveEditName = async () => {
    if (!person) return;
    const trimmed = nameInput.trim();
    if (!trimmed) {
      toast.error('Name cannot be empty');
      return;
    }
    if (trimmed === person.name) {
      setEditingName(false);
      return;
    }
    setBusy(true);
    try {
      await voiceBankApiService.updatePerson(personId, { name: trimmed });
      toast.success('Name updated');
      await load();
      onChanged();
      setEditingName(false);
    } catch (err) {
      toast.error('Failed to update name', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
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
        <div className="flex-1">
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveEditName();
                  if (e.key === 'Escape') cancelEditName();
                }}
                disabled={busy}
                className="text-2xl font-bold text-gray-900 border-b-2 border-blue-500 focus:outline-none bg-transparent"
                autoFocus
              />
              <button
                type="button"
                onClick={() => void saveEditName()}
                disabled={busy}
                className="p-1.5 text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
                title="Save"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={cancelEditName}
                disabled={busy}
                className="p-1.5 text-gray-400 hover:bg-gray-50 rounded disabled:opacity-50"
                title="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-gray-900">{person.name}</h2>
              <button
                type="button"
                onClick={startEditName}
                disabled={busy}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded disabled:opacity-50"
                title="Edit name"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            </div>
          )}
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
                className="flex flex-col gap-2 px-4 py-3 text-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs text-gray-500 truncate" title={s.audio_path}>
                      {s.audio_path.split('/').pop()}
                    </p>
                    <p className="text-gray-600 mt-0.5">
                      {s.duration_s > 0 ? `${s.duration_s.toFixed(1)}s` : 'duration unknown'} ·{' '}
                      {s.source}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPlayingSampleId(playingSampleId === s.id ? null : s.id)}
                      disabled={busy}
                      className="p-1.5 text-gray-400 hover:text-blue-600 disabled:opacity-50"
                      aria-label={playingSampleId === s.id ? 'Close player' : 'Play sample'}
                      title={playingSampleId === s.id ? 'Close' : 'Play'}
                    >
                      <Play className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteSample(s.id)}
                      disabled={busy}
                      className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-50"
                      aria-label="Delete sample"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {playingSampleId === s.id && (
                  <SampleAudioPlayer
                    personId={personId}
                    sampleId={s.id}
                    className="mt-1"
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

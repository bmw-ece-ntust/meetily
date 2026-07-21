"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Plus, RefreshCw, Users } from 'lucide-react';
import { toast } from 'sonner';
import { voiceBankApiService } from '@/services/voiceBankApiService';
import type { Person } from '@/types/voiceBank';
import { AddPersonDialog } from '@/components/VoiceBank/AddPersonDialog';
import { PersonDetailPanel } from '@/components/VoiceBank/PersonDetailPanel';

export default function VoiceBankPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get('person');

  const [persons, setPersons] = useState<Person[]>([]);
  const [enrolledIds, setEnrolledIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, vps] = await Promise.all([
        voiceBankApiService.listPersons(),
        voiceBankApiService.listVoiceprints().catch(() => []),
      ]);
      setPersons(list);
      setEnrolledIds(new Set(vps.map((v) => v.person_id)));
    } catch (err) {
      toast.error('Failed to load voice bank', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(
    () => [...persons].sort((a, b) => a.name.localeCompare(b.name)),
    [persons]
  );

  const openPerson = (id: string) => {
    router.push(`/voice-bank?person=${id}`);
  };

  const clearPerson = () => {
    router.push('/voice-bank');
  };

  return (
    <div className="h-screen bg-gray-50 flex flex-col">
      <div className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.back()}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                <span>Back</span>
              </button>
              <div className="flex items-center gap-2">
                <Users className="w-7 h-7 text-violet-600" />
                <h1 className="text-3xl font-bold">Voice bank</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="p-2 rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
              {!selectedId && (
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md"
                >
                  <Plus className="w-4 h-4" />
                  Add person
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-8 pt-4">
          {selectedId ? (
            <PersonDetailPanel
              personId={selectedId}
              enrolled={enrolledIds.has(selectedId)}
              onBack={clearPerson}
              onChanged={() => void load()}
            />
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-4">
                Enrolled people used for speaker identification. Create a person with an
                optional audio sample; identify needs a voiceprint (≈30s speech).
              </p>
              {loading ? (
                <p className="text-sm text-gray-400">Loading…</p>
              ) : sorted.length === 0 ? (
                <div className="border border-dashed border-gray-300 rounded-xl p-12 text-center bg-white">
                  <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-600 font-medium">No people yet</p>
                  <p className="text-sm text-gray-400 mt-1 mb-4">
                    Add lab members so meetings can auto-label their turns.
                  </p>
                  <button
                    type="button"
                    onClick={() => setAddOpen(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md"
                  >
                    <Plus className="w-4 h-4" />
                    Add person
                  </button>
                </div>
              ) : (
                <ul className="divide-y divide-gray-100 border border-gray-200 rounded-xl bg-white overflow-hidden">
                  {sorted.map((p) => {
                    const enrolled = enrolledIds.has(p.id);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => openPerson(p.id)}
                          className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 truncate">{p.name}</p>
                            {p.aliases?.length > 0 && (
                              <p className="text-xs text-gray-500 truncate mt-0.5">
                                {p.aliases.join(', ')}
                              </p>
                            )}
                          </div>
                          <span
                            className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${
                              enrolled
                                ? 'bg-green-50 text-green-800'
                                : 'bg-amber-50 text-amber-800'
                            }`}
                          >
                            {enrolled ? 'Enrolled' : 'Name only'}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      </div>

      <AddPersonDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => void load()}
      />
    </div>
  );
}

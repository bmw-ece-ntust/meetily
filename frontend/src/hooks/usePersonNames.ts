import { useState, useEffect } from 'react';
import { voiceBankApiService } from '../services/voiceBankApiService';

interface PersonNamesMap {
  [personId: string]: string;
}

/**
 * Hook to fetch and cache person names from the voice bank.
 * Returns a mapping of person_id -> person name.
 * 
 * Usage:
 * ```tsx
 * const { personNames, loading, error } = usePersonNames();
 * const displayName = personNames[transcript.person_id] || transcript.speaker;
 * ```
 */
export function usePersonNames() {
  const [personNames, setPersonNames] = useState<PersonNamesMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchPersons() {
      try {
        setLoading(true);
        setError(null);
        
        const persons = await voiceBankApiService.listPersons();
        
        if (!mounted) return;
        
        // Build person_id -> name mapping
        const namesMap: PersonNamesMap = {};
        for (const person of persons) {
          namesMap[person.id] = person.name;
        }
        
        setPersonNames(namesMap);
      } catch (err) {
        if (!mounted) return;
        console.error('Failed to fetch person names:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch person names');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchPersons();

    return () => {
      mounted = false;
    };
  }, []);

  return { personNames, loading, error };
}

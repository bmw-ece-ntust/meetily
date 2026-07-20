'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { PermissionStatus, OnboardingPermissions } from '@/types/onboarding';
import { toast } from 'sonner';

interface OnboardingStatus {
  version: string;
  completed: boolean;
  current_step: number;
  api_config: {
    configured: boolean;
    api_url?: string;
  };
  last_updated: string;
}

interface OnboardingContextType {
  currentStep: number;
  apiUrl: string;
  apiKey: string;
  isTestingConnection: boolean;
  connectionTestResult: 'idle' | 'testing' | 'success' | 'error';
  databaseExists: boolean;
  // Permissions
  permissions: OnboardingPermissions;
  permissionsSkipped: boolean;
  // Navigation
  goToStep: (step: number) => void;
  goNext: () => void;
  goPrevious: () => void;
  // Setters
  setApiUrl: (url: string) => void;
  setApiKey: (key: string) => void;
  setDatabaseExists: (value: boolean) => void;
  setPermissionStatus: (permission: keyof OnboardingPermissions, status: PermissionStatus) => void;
  setPermissionsSkipped: (skipped: boolean) => void;
  testApiConnection: () => Promise<boolean>;
  completeOnboarding: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [completed, setCompleted] = useState(false);
  const [apiUrl, setApiUrl] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('');
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [databaseExists, setDatabaseExists] = useState(false);

  // Permissions state
  const [permissions, setPermissions] = useState<OnboardingPermissions>({
    microphone: 'not_determined',
    systemAudio: 'not_determined',
    screenRecording: 'not_determined',
  });
  const [permissionsSkipped, setPermissionsSkipped] = useState(false);

  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  const isCompletingRef = useRef(false);

  // Load status on mount and initialize database
  useEffect(() => {
    loadOnboardingStatus();
    checkDatabaseStatus();
    initializeDatabaseInBackground();
  }, []);

  // Initialize database silently in background
  const initializeDatabaseInBackground = async () => {
    try {
      console.log('[OnboardingContext] Starting background database initialization');
      const isFirstLaunch = await invoke<boolean>('check_first_launch');

      if (!isFirstLaunch) {
        console.log('[OnboardingContext] Database exists, skipping initialization');
        setDatabaseExists(true);
        return;
      }

      // First launch - attempt auto-detection and import
      await performAutoDetection();
    } catch (error) {
      console.error('[OnboardingContext] Database initialization failed:', error);
      // Don't throw - database init failure shouldn't block onboarding
    }
  };

  const performAutoDetection = async () => {
    // Check Homebrew (macOS only)
    if (typeof navigator !== 'undefined' && navigator.platform?.toLowerCase().includes('mac')) {
      const homebrewDbPath = '/usr/local/var/meetily/meeting_minutes.db';
      try {
        const homebrewCheck = await invoke<{ exists: boolean; size: number } | null>(
          'check_homebrew_database',
          { path: homebrewDbPath }
        );

        if (homebrewCheck?.exists) {
          console.log('[OnboardingContext] Found Homebrew database, importing');
          await invoke('import_and_initialize_database', { legacyDbPath: homebrewDbPath });
          setDatabaseExists(true);
          return;
        }
      } catch (e) {
        console.log('[OnboardingContext] Homebrew check failed, continuing:', e);
      }
    }

    // Check default legacy database location
    try {
      const legacyPath = await invoke<string | null>('check_default_legacy_database');
      if (legacyPath) {
        console.log('[OnboardingContext] Found legacy database, importing');
        await invoke('import_and_initialize_database', { legacyDbPath: legacyPath });
        setDatabaseExists(true);
        return;
      }
    } catch (e) {
      console.log('[OnboardingContext] Legacy check failed, continuing:', e);
    }

    // No legacy database found - initialize fresh
    console.log('[OnboardingContext] No legacy database found, initializing fresh');
    await invoke('initialize_fresh_database');
    setDatabaseExists(true);
  };

  // Auto-save on state change (debounced)
  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    // Don't auto-save if completed or currently completing
    if (completed || isCompletingRef.current) return;

    saveTimeoutRef.current = setTimeout(() => {
      saveOnboardingStatus();
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [currentStep, completed]);

  const checkDatabaseStatus = async () => {
    try {
      const isFirstLaunch = await invoke<boolean>('check_first_launch');
      setDatabaseExists(!isFirstLaunch);
      console.log('[OnboardingContext] Database exists:', !isFirstLaunch);
    } catch (error) {
      console.error('[OnboardingContext] Failed to check database status:', error);
      setDatabaseExists(false);
    }
  };

  const loadOnboardingStatus = async () => {
    try {
      const status = await invoke<OnboardingStatus | null>('get_onboarding_status');
      if (status) {
        console.log('[OnboardingContext] Loaded saved status:', status);

        if (status.completed) {
          setCurrentStep(status.current_step);
          setCompleted(true);
          console.log('[OnboardingContext] Restored completed onboarding status');
          return;
        }

        // Restore in-progress state
        setCurrentStep(status.current_step);
        setCompleted(status.completed);

        console.log('[OnboardingContext] Restored status:', status);
      } else {
        console.log('[OnboardingContext] No saved status, starting fresh');
      }
    } catch (error) {
      console.error('[OnboardingContext] Failed to load onboarding status:', error);
    }
  };

  const saveOnboardingStatus = async () => {
    if (isCompletingRef.current) {
      console.log('[OnboardingContext] Skipping save during completion');
      return;
    }

    try {
      await invoke('save_onboarding_status_cmd', {
        status: {
          version: '2.0',
          completed: completed,
          current_step: currentStep,
          api_config: {
            configured: !!apiUrl,
            api_url: apiUrl || undefined,
          },
          last_updated: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('[OnboardingContext] Failed to save status:', error);
    }
  };

  const testApiConnection = async (): Promise<boolean> => {
    if (!apiUrl) {
      toast.error('Please enter an API URL');
      return false;
    }

    setIsTestingConnection(true);
    setConnectionTestResult('testing');

    try {
      const result = await invoke<boolean>('test_api_connection', { apiUrl });

      if (result) {
        setConnectionTestResult('success');
        toast.success('API connection successful!');
        return true;
      } else {
        setConnectionTestResult('error');
        toast.error('API connection failed');
        return false;
      }
    } catch (error) {
      console.error('[OnboardingContext] API connection test failed:', error);
      setConnectionTestResult('error');
      toast.error('Failed to connect to API', {
        description: error instanceof Error ? error.message : String(error),
      });
      return false;
    } finally {
      setIsTestingConnection(false);
    }
  };

  const completeOnboarding = async () => {
    try {
      isCompletingRef.current = true;

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = undefined;
      }

      // Validate API URL is not empty
      if (!apiUrl) {
        throw new Error('API URL is required');
      }

      // Call backend to save config and mark complete
      await invoke('complete_onboarding', {
        apiUrl: apiUrl,
        apiKey: apiKey || null,
      });

      setCompleted(true);
      console.log('[OnboardingContext] Onboarding completed with API:', apiUrl);

      isCompletingRef.current = false;
    } catch (error) {
      console.error('[OnboardingContext] Failed to complete onboarding:', error);
      isCompletingRef.current = false;
      throw error;
    }
  };

  const setPermissionStatus = useCallback((permission: keyof OnboardingPermissions, status: PermissionStatus) => {
    setPermissions((prev: OnboardingPermissions) => ({
      ...prev,
      [permission]: status,
    }));
  }, []);

  const goToStep = useCallback((step: number) => {
    setCurrentStep(Math.max(1, Math.min(step, 3))); // Max step 3
  }, []);

  const goNext = useCallback(() => {
    setCurrentStep((prev: number) => {
      const next = prev + 1;
      return Math.min(next, 3); // Don't go past step 3
    });
  }, []);

  const goPrevious = useCallback(() => {
    setCurrentStep((prev: number) => {
      const previous = prev - 1;
      return Math.max(previous, 1); // Don't go below step 1
    });
  }, []);

  return (
    <OnboardingContext.Provider
      value={{
        currentStep,
        apiUrl,
        apiKey,
        isTestingConnection,
        connectionTestResult,
        databaseExists,
        permissions,
        permissionsSkipped,
        goToStep,
        goNext,
        goPrevious,
        setApiUrl,
        setApiKey,
        setDatabaseExists,
        setPermissionStatus,
        setPermissionsSkipped,
        testApiConnection,
        completeOnboarding,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return context;
}

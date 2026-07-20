"use client";

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Server, Key, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type CommandResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

type ApiConfig = {
  base_url: string;
  api_key?: string | null;
};

export function ApiConfigSettings() {
  const [apiUrl, setApiUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    const load = async () => {
      try {
        const result = await invoke<CommandResult<ApiConfig>>('get_api_config');
        if (result.success && result.data) {
          setApiUrl(result.data.base_url || '');
          setApiKey(result.data.api_key || '');
        }
      } catch (error) {
        console.error('Failed to load API config:', error);
        toast.error('Failed to load API configuration');
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, []);

  const saveConfig = async (url: string, key: string) => {
    const result = await invoke<CommandResult<ApiConfig>>('set_api_config', {
      baseUrl: url,
      apiKey: key || null,
    });
    if (!result.success) {
      throw new Error(result.error || 'Failed to save API config');
    }
    return result.data;
  };

  const handleSave = async () => {
    const url = apiUrl.trim();
    if (!url) {
      toast.error('Please enter an API URL');
      return;
    }

    setIsSaving(true);
    setTestResult('idle');
    try {
      await saveConfig(url, apiKey);
      toast.success('API configuration saved');
    } catch (error) {
      toast.error('Failed to save API configuration', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    const url = apiUrl.trim();
    if (!url) {
      toast.error('Please enter an API URL');
      return;
    }

    setIsTesting(true);
    setTestResult('idle');
    try {
      await saveConfig(url, apiKey);
      const result = await invoke<CommandResult<boolean>>('test_api_connection');
      if (result.success && result.data) {
        setTestResult('success');
        toast.success('API connection successful');
      } else {
        setTestResult('error');
        toast.error('API connection failed', {
          description: result.error || 'Check your URL and try again.',
        });
      }
    } catch (error) {
      setTestResult('error');
      toast.error('Failed to connect to API', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500">
        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
        Loading configuration...
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-6 pt-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">API Connection</h2>
        <p className="text-sm text-gray-500 mt-1">
          Configure the ai-meeting-agent server used for transcription and summaries.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="settings-api-url" className="text-sm font-medium text-gray-700">
            API URL <span className="text-red-500">*</span>
          </Label>
          <div className="relative">
            <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              id="settings-api-url"
              type="url"
              placeholder="http://127.0.0.1:8080"
              value={apiUrl}
              onChange={(e) => {
                setApiUrl(e.target.value);
                setTestResult('idle');
              }}
              className="pl-10"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="settings-api-key" className="text-sm font-medium text-gray-700">
            API Key <span className="text-gray-400 font-normal">(optional)</span>
          </Label>
          <div className="relative">
            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              id="settings-api-key"
              type="password"
              placeholder="Enter API key if required"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setTestResult('idle');
              }}
              className="pl-10"
              autoComplete="off"
            />
          </div>
        </div>
      </div>

      {testResult !== 'idle' && (
        <div
          className={cn(
            'flex items-center gap-2 text-sm rounded-md px-3 py-2',
            testResult === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          )}
        >
          {testResult === 'success' ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <XCircle className="w-4 h-4" />
          )}
          {testResult === 'success' ? 'Connection successful' : 'Connection failed'}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => void handleTest()}
          disabled={isTesting || isSaving || !apiUrl.trim()}
        >
          {isTesting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Testing...
            </>
          ) : (
            'Test Connection'
          )}
        </Button>
        <Button
          type="button"
          onClick={() => void handleSave()}
          disabled={isSaving || isTesting || !apiUrl.trim()}
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Save'
          )}
        </Button>
      </div>
    </div>
  );
}

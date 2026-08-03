"use client";

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Calendar, CheckCircle, Key, Loader2, LogOut, XCircle } from 'lucide-react';
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

type GoogleStatus = {
  configured: boolean;
  connected: boolean;
  email?: string | null;
  client_id?: string | null;
};

export function GoogleSettings() {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const result = await invoke<CommandResult<GoogleStatus>>('get_google_status');
        if (result.success && result.data) {
          setStatus(result.data);
          setClientId(result.data.client_id || '');
        }
      } catch (error) {
        console.error('Failed to load Google status:', error);
        toast.error('Failed to load Google configuration');
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const result = await invoke<CommandResult<GoogleStatus>>('set_google_config', {
        clientId: clientId.trim() || null,
        clientSecret: clientSecret.trim() || null,
      });
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to save');
      }
      setStatus(result.data);
      setClientSecret('');
      toast.success('Google OAuth credentials saved');
    } catch (error) {
      toast.error('Failed to save Google configuration', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const result = await invoke<CommandResult<GoogleStatus>>('google_connect');
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Connection failed');
      }
      setStatus(result.data);
      toast.success('Google account connected', {
        description: result.data.email || undefined,
      });
    } catch (error) {
      toast.error('Failed to connect Google account', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      const result = await invoke<CommandResult<GoogleStatus>>('google_disconnect');
      if (result.success && result.data) {
        setStatus(result.data);
        toast.success('Google account disconnected');
      }
    } catch (error) {
      toast.error('Failed to disconnect', {
        description: error instanceof Error ? error.message : String(error),
      });
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
    <div className="max-w-lg space-y-6 pt-10 border-t border-gray-200 mt-10">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Google Calendar &amp; Gmail</h2>
        <p className="text-sm text-gray-500 mt-1">
          Send meeting minutes to calendar attendees by email. Requires a Google Cloud OAuth
          client — see <code className="bg-gray-100 px-1 rounded">docs/GOOGLE_CALENDAR_SETUP.md</code>.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="settings-google-client-id" className="text-sm font-medium text-gray-700">
            OAuth Client ID
          </Label>
          <div className="relative">
            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              id="settings-google-client-id"
              type="text"
              placeholder="....apps.googleusercontent.com"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="pl-10"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="settings-google-client-secret" className="text-sm font-medium text-gray-700">
            OAuth Client Secret
          </Label>
          <div className="relative">
            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              id="settings-google-client-secret"
              type="password"
              placeholder={status?.configured ? '(saved — enter to replace)' : 'GOCSPX-...'}
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              className="pl-10"
              autoComplete="off"
            />
          </div>
          <p className="text-xs text-gray-500">
            Desktop-app type OAuth client with Calendar read + Gmail send scopes.
          </p>
        </div>
      </div>

      <div
        className={cn(
          'rounded-md border px-3 py-3 text-sm flex items-center gap-2',
          status?.connected
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-gray-50 border-gray-200 text-gray-600'
        )}
      >
        {status?.connected ? (
          <CheckCircle className="w-4 h-4" />
        ) : (
          <XCircle className="w-4 h-4" />
        )}
        {status?.connected
          ? `Connected${status.email ? ` as ${status.email}` : ''}`
          : 'Not connected'}
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => void handleSave()}
          disabled={isSaving || isConnecting || !clientId.trim()}
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Credentials'
          )}
        </Button>
        {status?.connected ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleDisconnect()}
            disabled={isConnecting}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Disconnect
          </Button>
        ) : (
          <Button
            type="button"
            onClick={() => void handleConnect()}
            disabled={isConnecting || !status?.configured}
          >
            {isConnecting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Waiting for sign-in...
              </>
            ) : (
              <>
                <Calendar className="w-4 h-4 mr-2" />
                Connect Google Account
              </>
            )}
          </Button>
        )}
      </div>
      {isConnecting && (
        <p className="text-xs text-gray-500">
          A browser window opened for Google sign-in. Finish it there; this can take up to 10
          minutes before it times out.
        </p>
      )}
    </div>
  );
}

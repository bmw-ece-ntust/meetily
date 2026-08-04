"use client";

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Calendar, CheckCircle, ExternalLink, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

type CommandResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

type GoogleAccount = {
  google_email: string;
  scopes: string;
  auto_join: boolean;
  connected_at: string;
};

type GoogleStatus = {
  enabled: boolean;
  configured: boolean;
  accounts: GoogleAccount[];
};

export function GoogleSettings() {
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);

  const load = async () => {
    try {
      const result = await invoke<CommandResult<GoogleStatus>>('get_google_status');
      if (result.success && result.data) {
        setStatus(result.data);
      } else {
        setStatus(null);
        if (result.error) toast.error('Google status unavailable', { description: result.error });
      }
    } catch (error) {
      console.error('Failed to load Google status:', error);
      toast.error('Failed to load Google status');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const result = await invoke<CommandResult<{ auth_url: string }>>('google_connect_url');
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to start Google connect');
      }
      await invoke('open_external_url', { url: result.data.auth_url });
      toast.info('Finish sign-in in your browser', {
        description: 'The account appears here once Google redirects back to the server.',
      });
      // Poll for the new account for a short while.
      const started = Date.now();
      const poll = setInterval(async () => {
        await load();
        if (Date.now() - started > 120_000) clearInterval(poll);
      }, 5_000);
      setTimeout(() => clearInterval(poll), 130_000);
    } catch (error) {
      toast.error('Failed to connect Google account', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleToggleAutoJoin = async (email: string, autoJoin: boolean) => {
    try {
      const result = await invoke<CommandResult<unknown>>('google_set_auto_join', {
        email,
        autoJoin,
      });
      if (!result.success) throw new Error(result.error || 'Update failed');
      await load();
    } catch (error) {
      toast.error('Failed to update account', {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleDisconnect = async (email: string) => {
    if (!confirm(`Disconnect ${email}? Auto-join and minutes email stop for this account.`)) {
      return;
    }
    try {
      const result = await invoke<CommandResult<unknown>>('google_disconnect_account', { email });
      if (!result.success) throw new Error(result.error || 'Disconnect failed');
      toast.success(`Disconnected ${email}`);
      await load();
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

  const unavailable = !status || !status.enabled || !status.configured;

  return (
    <div className="max-w-lg space-y-6 pt-10 border-t border-gray-200 mt-10">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Google Calendar &amp; Gmail</h2>
        <p className="text-sm text-gray-500 mt-1">
          The server auto-joins today&apos;s Teams meetings and emails certified minutes to
          attendees. Google sign-in happens on the server — this app stores no Google credentials.
          Setup guide lives in the ai-meeting-agent repo:{' '}
          <code className="bg-gray-100 px-1 rounded">docs/GOOGLE_CALENDAR_SETUP.md</code>.
        </p>
      </div>

      {unavailable ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800 flex items-start gap-2">
          <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Google integration not enabled on the server</p>
            <p className="mt-1">
              Set <code className="bg-amber-100 px-1 rounded">GOOGLE_CALENDAR_ENABLED=true</code>{' '}
              and the OAuth env vars on ai-meeting-agent, then reload this page.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {status.accounts.length === 0 ? (
              <p className="text-sm text-gray-500">No Google accounts connected yet.</p>
            ) : (
              status.accounts.map((account) => (
                <div
                  key={account.google_email}
                  className="rounded-md border border-gray-200 px-3 py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                      <span className="truncate">{account.google_email}</span>
                    </p>
                    <label className="mt-1 flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={account.auto_join}
                        onChange={(e) =>
                          void handleToggleAutoJoin(account.google_email, e.target.checked)
                        }
                        className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
                      />
                      Auto-join Teams meetings from this calendar
                    </label>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleDisconnect(account.google_email)}
                  >
                    Disconnect
                  </Button>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button type="button" onClick={() => void handleConnect()} disabled={isConnecting}>
              {isConnecting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Opening browser...
                </>
              ) : (
                <>
                  <Calendar className="w-4 h-4 mr-2" />
                  Connect Google Account
                  <ExternalLink className="w-3.5 h-3.5 ml-1" />
                </>
              )}
            </Button>
          </div>
          <p className="text-xs text-gray-500">
            Each user connects their own Google account. The server stores refresh tokens
            encrypted; revoking access at myaccount.google.com/permissions also works.
          </p>
        </>
      )}
    </div>
  );
}

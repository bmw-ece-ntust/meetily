"use client";

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Github, Key, CheckCircle, XCircle, Loader2 } from 'lucide-react';
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

type GithubExportConfig = {
  github_token?: string | null;
  repo_url?: string | null;
  configured: boolean;
};

type PermissionChecks = {
  token_valid: boolean;
  repo_accessible: boolean;
  can_push: boolean;
  branch_exists: boolean;
  path_ok: boolean;
};

type PermissionCheckResult = {
  ok: boolean;
  checks: PermissionChecks;
  user?: string | null;
  error?: string | null;
  details: string[];
};

const CHECK_LABELS: Array<{ key: keyof PermissionChecks; label: string }> = [
  { key: 'token_valid', label: 'Token valid' },
  { key: 'repo_accessible', label: 'Repository accessible' },
  { key: 'can_push', label: 'Push permission' },
  { key: 'branch_exists', label: 'Branch exists' },
  { key: 'path_ok', label: 'Target path OK' },
];

export function GitHubExportSettings() {
  const [token, setToken] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [permissionResult, setPermissionResult] = useState<PermissionCheckResult | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const result = await invoke<CommandResult<GithubExportConfig>>('get_github_export_config');
        if (result.success && result.data) {
          setToken(result.data.github_token || '');
          setRepoUrl(result.data.repo_url || '');
        }
      } catch (error) {
        console.error('Failed to load GitHub export config:', error);
        toast.error('Failed to load GitHub export configuration');
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, []);

  const saveConfig = async (nextToken: string, nextUrl: string) => {
    const result = await invoke<CommandResult<GithubExportConfig>>('set_github_export_config', {
      githubToken: nextToken || null,
      repoUrl: nextUrl || null,
    });
    if (!result.success) {
      throw new Error(result.error || 'Failed to save GitHub export config');
    }
    return result.data;
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveConfig(token.trim(), repoUrl.trim());
      toast.success('GitHub export configuration saved');
    } catch (error) {
      toast.error('Failed to save GitHub export configuration', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!token.trim() || !repoUrl.trim()) {
      toast.error('Enter both GitHub token and repository URL');
      return;
    }

    setIsTesting(true);
    setPermissionResult(null);
    try {
      await saveConfig(token.trim(), repoUrl.trim());
      const result = await invoke<CommandResult<PermissionCheckResult>>(
        'test_github_export_permissions',
        {
          githubToken: token.trim(),
          repoUrl: repoUrl.trim(),
        }
      );
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Permission check failed');
      }
      setPermissionResult(result.data);
      if (result.data.ok) {
        toast.success('GitHub write permissions OK', {
          description: result.data.user ? `Authenticated as ${result.data.user}` : undefined,
        });
      } else {
        toast.error('GitHub permission check failed', {
          description: result.data.error || 'See details below',
        });
      }
    } catch (error) {
      toast.error('Failed to check GitHub permissions', {
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
    <div className="max-w-lg space-y-6 pt-10 border-t border-gray-200 mt-10">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">GitHub Export</h2>
        <p className="text-sm text-gray-500 mt-1">
          Publish meeting notes to a GitHub repository path after a meeting is done.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="settings-github-token" className="text-sm font-medium text-gray-700">
            GitHub Personal Access Token
          </Label>
          <div className="relative">
            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              id="settings-github-token"
              type="password"
              placeholder="ghp_... or fine-grained token"
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setPermissionResult(null);
              }}
              className="pl-10"
              autoComplete="off"
            />
          </div>
          <p className="text-xs text-gray-500">
            Classic: <code className="bg-gray-100 px-1 rounded">repo</code> scope. Fine-grained:
            Contents <strong>Read and write</strong> on the target repo.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="settings-github-url" className="text-sm font-medium text-gray-700">
            Repository URL
          </Label>
          <div className="relative">
            <Github className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              id="settings-github-url"
              type="url"
              placeholder="https://github.com/owner/repo/tree/branch/docs/meetings"
              value={repoUrl}
              onChange={(e) => {
                setRepoUrl(e.target.value);
                setPermissionResult(null);
              }}
              className="pl-10"
            />
          </div>
          <p className="text-xs text-gray-500">
            Full tree URL including branch and target folder.
          </p>
        </div>
      </div>

      {permissionResult && (
        <div
          className={cn(
            'rounded-md border px-3 py-3 space-y-2 text-sm',
            permissionResult.ok
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          )}
        >
          <div className="flex items-center gap-2 font-medium">
            {permissionResult.ok ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <XCircle className="w-4 h-4" />
            )}
            {permissionResult.ok
              ? 'Write readiness OK'
              : permissionResult.error || 'Permission check failed'}
          </div>
          <ul className="space-y-1">
            {CHECK_LABELS.map(({ key, label }) => {
              const passed = permissionResult.checks[key];
              return (
                <li key={key} className="flex items-center gap-2">
                  {passed ? (
                    <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-red-500" />
                  )}
                  <span>{label}</span>
                </li>
              );
            })}
          </ul>
          {permissionResult.details.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs opacity-90 list-disc pl-4">
              {permissionResult.details.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => void handleTest()}
          disabled={isTesting || isSaving || !token.trim() || !repoUrl.trim()}
        >
          {isTesting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Checking...
            </>
          ) : (
            'Test Permissions'
          )}
        </Button>
        <Button
          type="button"
          onClick={() => void handleSave()}
          disabled={isSaving || isTesting}
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

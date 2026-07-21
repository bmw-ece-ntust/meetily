import React, { useEffect, useState } from 'react';
import { Github, Key, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OnboardingContainer } from '../OnboardingContainer';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type CommandResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
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

interface GitHubExportStepProps {
  onComplete?: () => void;
}

export function GitHubExportStep({ onComplete }: GitHubExportStepProps) {
  const {
    githubToken,
    githubRepoUrl,
    setGithubToken,
    setGithubRepoUrl,
    goNext,
    completeOnboarding,
    saveGithubExportConfig,
  } = useOnboarding();

  const [localToken, setLocalToken] = useState(githubToken || '');
  const [localUrl, setLocalUrl] = useState(githubRepoUrl || '');
  const [isTesting, setIsTesting] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [permissionResult, setPermissionResult] = useState<PermissionCheckResult | null>(null);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    const checkPlatform = async () => {
      try {
        const { platform } = await import('@tauri-apps/plugin-os');
        setIsMac(platform() === 'macos');
      } catch {
        setIsMac(navigator.userAgent.includes('Mac'));
      }
    };
    void checkPlatform();
  }, []);

  const handleTest = async () => {
    if (!localToken.trim() || !localUrl.trim()) {
      toast.error('Enter both GitHub token and repository URL');
      return;
    }

    setIsTesting(true);
    setPermissionResult(null);
    setGithubToken(localToken);
    setGithubRepoUrl(localUrl);

    try {
      const result = await invoke<CommandResult<PermissionCheckResult>>(
        'test_github_export_permissions',
        {
          githubToken: localToken.trim(),
          repoUrl: localUrl.trim(),
        }
      );
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Permission check failed');
      }
      setPermissionResult(result.data);
      if (result.data.ok) {
        toast.success('GitHub write permissions OK');
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

  const finishOrNext = async (saveConfig: boolean) => {
    setIsContinuing(true);
    try {
      if (saveConfig) {
        await saveGithubExportConfig(localToken.trim(), localUrl.trim());
        setGithubToken(localToken);
        setGithubRepoUrl(localUrl);
      }

      if (isMac) {
        goNext();
      } else {
        await completeOnboarding();
        onComplete?.();
        await new Promise((resolve) => setTimeout(resolve, 100));
        window.location.reload();
      }
    } catch (error) {
      console.error('GitHub export step failed:', error);
      toast.error('Failed to continue setup', {
        description: error instanceof Error ? error.message : String(error),
      });
      setIsContinuing(false);
    }
  };

  const handleContinue = async () => {
    if (!localToken.trim() || !localUrl.trim()) {
      toast.error('Enter token and URL, or skip this step');
      return;
    }
    if (!permissionResult?.ok) {
      toast.error('Run Test Permissions and fix failures before continuing');
      return;
    }
    await finishOrNext(true);
  };

  const handleSkip = async () => {
    toast.info('Skipping GitHub export', {
      description: 'You can configure this later in Settings.',
    });
    await finishOrNext(false);
  };

  const totalSteps = isMac ? 4 : 3;

  return (
    <OnboardingContainer
      title="GitHub Export (Optional)"
      description="Publish meeting notes to your internship docs/meetings folder after each meeting"
      step={3}
      totalSteps={totalSteps}
    >
      <div className="flex flex-col items-center space-y-6">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-2">
            <Label htmlFor="onboarding-github-token" className="text-sm font-medium text-gray-700">
              GitHub Personal Access Token
            </Label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                id="onboarding-github-token"
                type="password"
                placeholder="ghp_... or fine-grained token"
                value={localToken}
                onChange={(e) => {
                  setLocalToken(e.target.value);
                  setPermissionResult(null);
                }}
                className="pl-10"
                autoComplete="off"
              />
            </div>
            <p className="text-xs text-gray-500">
              Classic: <code className="bg-gray-100 px-1 rounded">repo</code> scope. Fine-grained:
              Contents Read and write.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="onboarding-github-url" className="text-sm font-medium text-gray-700">
              Repository URL
            </Label>
            <div className="relative">
              <Github className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                id="onboarding-github-url"
                type="url"
                placeholder="https://github.com/owner/repo/tree/branch/docs/meetings"
                value={localUrl}
                onChange={(e) => {
                  setLocalUrl(e.target.value);
                  setPermissionResult(null);
                }}
                className="pl-10"
              />
            </div>
          </div>

          <Button
            onClick={() => void handleTest()}
            disabled={!localToken.trim() || !localUrl.trim() || isTesting}
            variant="outline"
            className="w-full h-11"
          >
            {isTesting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Checking Permissions...
              </>
            ) : (
              'Test Permissions'
            )}
          </Button>

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
            </div>
          )}
        </div>

        <div className="w-full max-w-md space-y-3">
          <Button
            onClick={() => void handleContinue()}
            disabled={isContinuing || isTesting || !permissionResult?.ok}
            className="w-full h-11 bg-gray-900 hover:bg-gray-800 text-white disabled:opacity-50"
          >
            {isContinuing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : isMac ? (
              'Continue to Permissions'
            ) : (
              'Complete Setup'
            )}
          </Button>

          <button
            type="button"
            onClick={() => void handleSkip()}
            disabled={isContinuing || isTesting}
            className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Skip for now
          </button>
        </div>
      </div>
    </OnboardingContainer>
  );
}

import React, { useState, useEffect } from 'react';
import { Server, Key, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OnboardingContainer } from '../OnboardingContainer';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ApiConfigurationStepProps {
  onComplete?: () => void;
}

export function ApiConfigurationStep({ onComplete }: ApiConfigurationStepProps) {
  const {
    apiUrl,
    apiKey,
    setApiUrl,
    setApiKey,
    goNext,
    testApiConnection,
    isTestingConnection,
    connectionTestResult,
    completeOnboarding,
  } = useOnboarding();

  const [localUrl, setLocalUrl] = useState(apiUrl || '');
  const [localKey, setLocalKey] = useState(apiKey || '');
  const [isCompleting, setIsCompleting] = useState(false);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    const checkPlatform = async () => {
      try {
        const { platform } = await import('@tauri-apps/plugin-os');
        setIsMac(platform() === 'macos');
      } catch (e) {
        setIsMac(navigator.userAgent.includes('Mac'));
      }
    };
    checkPlatform();
  }, []);

  const handleTest = async () => {
    if (!localUrl) {
      toast.error('Please enter an API URL');
      return;
    }

    // Update context with current values
    setApiUrl(localUrl);
    setApiKey(localKey);

    await testApiConnection();
  };

  const handleContinue = async () => {
    // Update context
    setApiUrl(localUrl);
    setApiKey(localKey);

    if (!localUrl) {
      toast.error('Please enter an API URL');
      return;
    }

    if (isMac) {
      // macOS: Go to permissions step
      goNext();
    } else {
      // Non-macOS: Complete onboarding immediately
      setIsCompleting(true);
      try {
        await completeOnboarding();
        onComplete?.(); // Call parent callback

        // Small delay to ensure state is saved
        await new Promise(resolve => setTimeout(resolve, 100));

        window.location.reload();
      } catch (error) {
        console.error('Failed to complete onboarding:', error);
        toast.error('Failed to complete setup', {
          description: 'Please try again.',
        });
        setIsCompleting(false);
      }
    }
  };

  const handleSkipTest = () => {
    if (!localUrl) {
      toast.error('Please enter an API URL');
      return;
    }

    toast.info('Skipping connection test', {
      description: 'You can test the connection later in settings.',
    });

    handleContinue();
  };

  const canContinue = !!localUrl;

  return (
    <OnboardingContainer
      title="Configure API Connection"
      description="Enter your AI processing server details to enable transcription and summarization"
      step={2}
      totalSteps={isMac ? 3 : 2}
    >
      <div className="flex flex-col items-center space-y-6">
        <div className="w-full max-w-md space-y-6">
          {/* API URL Input */}
          <div className="space-y-2">
            <Label htmlFor="api-url" className="text-sm font-medium text-gray-700">
              API URL <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                id="api-url"
                type="url"
                placeholder="http://127.0.0.1:8080"
                value={localUrl}
                onChange={(e) => setLocalUrl(e.target.value)}
                className="pl-10"
              />
            </div>
            <p className="text-xs text-gray-500">
              The URL of your ai-meeting-agent API server
            </p>
          </div>

          {/* API Key Input */}
          <div className="space-y-2">
            <Label htmlFor="api-key" className="text-sm font-medium text-gray-700">
              API Key <span className="text-gray-400">(Optional)</span>
            </Label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                id="api-key"
                type="password"
                placeholder="Leave empty if not required"
                value={localKey}
                onChange={(e) => setLocalKey(e.target.value)}
                className="pl-10"
              />
            </div>
            <p className="text-xs text-gray-500">
              Leave empty if your server doesn't require authentication
            </p>
          </div>

          {/* Test Connection Button */}
          <div className="space-y-3">
            <Button
              onClick={handleTest}
              disabled={!localUrl || isTestingConnection}
              variant="outline"
              className="w-full h-11"
            >
              {isTestingConnection ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Testing Connection...
                </>
              ) : (
                'Test Connection'
              )}
            </Button>

            {/* Connection Status */}
            {connectionTestResult !== 'idle' && (
              <div
                className={cn(
                  'flex items-center gap-2 p-3 rounded-md text-sm',
                  connectionTestResult === 'success' && 'bg-green-50 text-green-700 border border-green-200',
                  connectionTestResult === 'error' && 'bg-red-50 text-red-700 border border-red-200'
                )}
              >
                {connectionTestResult === 'success' ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>Connection successful!</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4" />
                    <span>Connection failed. Check your URL and try again.</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="w-full max-w-md space-y-3">
          <Button
            onClick={handleContinue}
            disabled={!canContinue || isCompleting}
            className="w-full h-11 bg-gray-900 hover:bg-gray-800 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCompleting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Completing Setup...
              </>
            ) : isMac ? (
              'Continue to Permissions'
            ) : (
              'Complete Setup'
            )}
          </Button>

          {connectionTestResult !== 'success' && localUrl && (
            <button
              onClick={handleSkipTest}
              className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Skip test and continue anyway
            </button>
          )}
        </div>
      </div>
    </OnboardingContainer>
  );
}

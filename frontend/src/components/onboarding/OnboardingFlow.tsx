import React, { useEffect } from 'react';
import { useOnboarding } from '@/contexts/OnboardingContext';
import {
  WelcomeStep,
  ApiConfigurationStep,
  GitHubExportStep,
  PermissionsStep,
} from './steps';

interface OnboardingFlowProps {
  onComplete: () => void;
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const { currentStep } = useOnboarding();
  const [isMac, setIsMac] = React.useState(false);

  useEffect(() => {
    const checkPlatform = async () => {
      try {
        const { platform } = await import('@tauri-apps/plugin-os');
        setIsMac(platform() === 'macos');
      } catch (e) {
        console.error('Failed to detect platform:', e);
        setIsMac(navigator.userAgent.includes('Mac'));
      }
    };
    checkPlatform();
  }, []);

  // Step 1: Welcome
  // Step 2: API Configuration
  // Step 3: GitHub Export (optional / skippable)
  // Step 4: Permissions (macOS only)

  return (
    <div className="onboarding-flow">
      {currentStep === 1 && <WelcomeStep />}
      {currentStep === 2 && <ApiConfigurationStep onComplete={onComplete} />}
      {currentStep === 3 && <GitHubExportStep onComplete={onComplete} />}
      {currentStep === 4 && isMac && <PermissionsStep onComplete={onComplete} />}
    </div>
  );
}

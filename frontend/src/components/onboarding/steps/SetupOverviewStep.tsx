import React, { useEffect, useState } from 'react';
import { Database, Server, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OnboardingContainer } from '../OnboardingContainer';
import { useOnboarding } from '@/contexts/OnboardingContext';

export function SetupOverviewStep() {
  const { goNext } = useOnboarding();
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

  const steps = [
    {
      icon: <Database className="w-5 h-5 text-gray-600" />,
      title: 'Initialize Local Database',
      description: 'Set up local storage for your meeting records',
    },
    {
      icon: <Server className="w-5 h-5 text-gray-600" />,
      title: 'Configure API Connection',
      description: 'Connect to your AI processing server',
    },
    ...(isMac
      ? [
          {
            icon: <Mic className="w-5 h-5 text-gray-600" />,
            title: 'Grant Permissions',
            description: 'Allow microphone and system audio access',
          },
        ]
      : []),
  ];

  const handleContinue = () => {
    goNext();
  };

  return (
    <OnboardingContainer
      title="Setup Overview"
      description="Meetily will guide you through a quick setup process"
      step={1}
      totalSteps={isMac ? 3 : 2}
    >
      <div className="flex flex-col items-center space-y-10">
        {/* Steps Card */}
        <div className="w-full max-w-md bg-white rounded-lg border border-gray-200 p-6">
          <div className="space-y-6">
            {steps.map((step, idx) => (
              <div key={idx} className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                  {step.icon}
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900">{step.title}</h3>
                  <p className="text-sm text-gray-600 mt-1">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA Section */}
        <div className="w-full max-w-xs space-y-4">
          <Button
            onClick={handleContinue}
            className="w-full h-11 bg-gray-900 hover:bg-gray-800 text-white"
          >
            Let's Go
          </Button>
          <div className="text-center">
            <a
              href="https://github.com/Zackriya-Solutions/meeting-minutes"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-600 hover:underline"
            >
              Report issues on GitHub
            </a>
          </div>
        </div>
      </div>
    </OnboardingContainer>
  );
}

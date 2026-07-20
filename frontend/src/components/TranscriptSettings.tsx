import { Label } from './ui/label';

export interface TranscriptModelProps {
  provider: 'openai';
  model: string;
  apiKey?: string | null;
}

export interface TranscriptSettingsProps {
  transcriptModelConfig: TranscriptModelProps;
  setTranscriptModelConfig: (config: TranscriptModelProps) => void;
  onModelSelect?: () => void;
}

export function TranscriptSettings({
  transcriptModelConfig,
  setTranscriptModelConfig,
  onModelSelect,
}: TranscriptSettingsProps) {
  const resetLocalMetadata = () => {
    setTranscriptModelConfig({ provider: 'openai', model: 'whisper-1', apiKey: null });
    onModelSelect?.();
  };

  const hasLegacyConfig = transcriptModelConfig.provider !== 'openai' || transcriptModelConfig.model !== 'whisper-1';

  return (
    <div className="space-y-4 pb-6">
      <div>
        <Label className="block text-sm font-medium text-gray-700 mb-1">
          Transcription Service
        </Label>
        <div className="mx-1 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          <p className="font-medium text-gray-900">ai-meeting-agent API</p>
          <p className="mt-1">
            Transcription provider and model are configured on server. Desktop app uploads audio only.
          </p>
          {hasLegacyConfig && (
            <button
              type="button"
              onClick={resetLocalMetadata}
              className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Reset local config metadata
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

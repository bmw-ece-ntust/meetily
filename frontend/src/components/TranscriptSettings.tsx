import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Eye, EyeOff, Lock, Unlock } from 'lucide-react';

export interface TranscriptModelProps {
    provider: 'deepgram' | 'elevenLabs' | 'groq' | 'openai';
    model: string;
    apiKey?: string | null;
}

export interface TranscriptSettingsProps {
    transcriptModelConfig: TranscriptModelProps;
    setTranscriptModelConfig: (config: TranscriptModelProps) => void;
    onModelSelect?: () => void;
}

export function TranscriptSettings({ transcriptModelConfig, setTranscriptModelConfig, onModelSelect }: TranscriptSettingsProps) {
    const [apiKey, setApiKey] = useState<string | null>(transcriptModelConfig.apiKey || null);
    const [showApiKey, setShowApiKey] = useState<boolean>(false);
    const [isApiKeyLocked, setIsApiKeyLocked] = useState<boolean>(true);
    const [isLockButtonVibrating, setIsLockButtonVibrating] = useState<boolean>(false);
    const [uiProvider, setUiProvider] = useState<TranscriptModelProps['provider']>(transcriptModelConfig.provider);
    const [isSaving, setIsSaving] = useState<boolean>(false);

    // Sync uiProvider when backend config changes (e.g., after model selection or initial load)
    useEffect(() => {
        setUiProvider(transcriptModelConfig.provider);
    }, [transcriptModelConfig.provider]);

    // Sync apiKey when backend config or provider changes (mount + provider switch)
    useEffect(() => {
        const incoming = transcriptModelConfig.apiKey;
        if (incoming !== undefined && incoming !== apiKey) {
            setApiKey(incoming || '');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transcriptModelConfig.provider, transcriptModelConfig.apiKey]);

    const fetchApiKey = async (provider: string) => {
        try {
            const data = await invoke('api_get_transcript_api_key', { provider }) as string;
            setApiKey(data || '');
        } catch (err) {
            console.error('Error fetching API key:', err);
            setApiKey(null);
        }
    };

    const modelOptions = {
        deepgram: ['nova-2', 'nova-2-general', 'nova-2-meeting', 'nova-2-phonecall', 'nova-2-voicemail', 'nova-2-finance', 'nova-2-conversationalai', 'nova-2-video', 'nova-2-medical', 'nova-2-drivethru', 'nova-2-automotive'],
        elevenLabs: ['eleven_multilingual_v2', 'eleven_turbo_v2_5'],
        groq: ['whisper-large-v3', 'whisper-large-v3-turbo', 'distil-whisper-large-v3-en'],
        openai: ['whisper-1'],
    };

    const handleInputClick = () => {
        if (isApiKeyLocked) {
            setIsLockButtonVibrating(true);
            setTimeout(() => setIsLockButtonVibrating(false), 500);
        }
    };

    const handleSave = async () => {
        if (!transcriptModelConfig.provider || !transcriptModelConfig.model) {
            toast.error('Please select a provider and model');
            return;
        }
        if (!apiKey || apiKey.trim() === '') {
            toast.error('Please enter an API key');
            return;
        }
        setIsSaving(true);
        try {
            await invoke('api_save_transcript_config', {
                provider: uiProvider,
                model: transcriptModelConfig.model,
                apiKey: apiKey,
            });
            setTranscriptModelConfig({
                ...transcriptModelConfig,
                provider: uiProvider,
                apiKey: apiKey,
            });
            const { emit } = await import('@tauri-apps/api/event');
            await emit('transcript-config-updated', {
                provider: uiProvider,
                model: transcriptModelConfig.model,
                apiKey: apiKey,
            });
            toast.success('Transcript settings saved');
        } catch (err) {
            console.error('Failed to save transcript settings:', err);
            toast.error('Failed to save transcript settings');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div>
            <div>
                <div className="space-y-4 pb-6">
                    <div>
                        <Label className="block text-sm font-medium text-gray-700 mb-1">
                            Transcript Provider
                        </Label>
                        <div className="flex space-x-2 mx-1">
                            <Select
                                value={uiProvider}
                                onValueChange={(value) => {
                                    const provider = value as TranscriptModelProps['provider'];
                                    setUiProvider(provider);
                                    fetchApiKey(provider);
                                }}
                            >
                                <SelectTrigger className='focus:ring-1 focus:ring-blue-500 focus:border-blue-500'>
                                    <SelectValue placeholder="Select provider" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="deepgram">☁️ Deepgram</SelectItem>
                                    <SelectItem value="elevenLabs">☁️ ElevenLabs</SelectItem>
                                    <SelectItem value="groq">☁️ Groq</SelectItem>
                                    <SelectItem value="openai">☁️ OpenAI</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select
                                value={transcriptModelConfig.model}
                                onValueChange={(value) => {
                                    const model = value as TranscriptModelProps['model'];
                                    setTranscriptModelConfig({ ...transcriptModelConfig, provider: uiProvider, model });
                                }}
                            >
                                <SelectTrigger className='focus:ring-1 focus:ring-blue-500 focus:border-blue-500'>
                                    <SelectValue placeholder="Select model" />
                                </SelectTrigger>
                                <SelectContent>
                                    {modelOptions[uiProvider].map((model) => (
                                        <SelectItem key={model} value={model}>{model}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div>
                        <Label className="block text-sm font-medium text-gray-700 mb-1">
                            API Key
                        </Label>
                        <div className="relative mx-1">
                            <Input
                                type={showApiKey ? "text" : "password"}
                                className={`pr-24 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${isApiKeyLocked ? 'bg-gray-100 cursor-not-allowed' : ''
                                    }`}
                                value={apiKey || ''}
                                onChange={(e) => setApiKey(e.target.value)}
                                disabled={isApiKeyLocked}
                                onClick={handleInputClick}
                                placeholder="Enter your API key"
                            />
                            {isApiKeyLocked && (
                                <div
                                    onClick={handleInputClick}
                                    className="absolute inset-y-0 left-0 right-24 flex items-center justify-center bg-gray-100 bg-opacity-50 rounded-md cursor-not-allowed pointer-events-auto"
                                />
                            )}
                            <div className="absolute inset-y-0 right-0 pr-1 flex items-center">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setIsApiKeyLocked(!isApiKeyLocked)}
                                    className={`transition-colors duration-200 ${isLockButtonVibrating ? 'animate-vibrate text-red-500' : ''
                                        }`}
                                    title={isApiKeyLocked ? "Unlock to edit" : "Lock to prevent editing"}
                                >
                                    {isApiKeyLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setShowApiKey(!showApiKey)}
                                >
                                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end pt-2">
                        <Button
                            type="button"
                            onClick={handleSave}
                            disabled={isSaving}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {isSaving ? 'Saving...' : 'Save'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}

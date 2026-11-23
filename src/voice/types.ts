export type VoiceSessionState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error'
  | 'permission_needed';

export interface SttWord {
  text: string;
  start: number;
  end: number;
  type?: string;
  confidence?: number;
}

export interface SttResult {
  text: string;
  confidence: number; // 0.0 to 1.0
  detectedLanguage?: string;
  words?: SttWord[];
}

export interface SttProvider {
  transcribe(audioBlob: Blob, languageCode?: string): Promise<SttResult>;
}

export interface TtsOptions {
  voiceId?: string;
  modelId?: string;
  speed?: number; // 0.5 to 2.0 (default 1.0)
  language?: string;
}

export interface TtsProvider {
  synthesize(text: string, options: TtsOptions): Promise<ArrayBuffer>;
  play(audioData: ArrayBuffer, onEnded?: () => void): Promise<void>;
  stop(): void;
  setSpeed(speed: number): void;
  isPlaying(): boolean;
  clearCache(): void;
  repeatLastSpoken?(): Promise<void>;
  slowerPlease?(): Promise<void>;
}

export interface VoiceConfig {
  elevenLabsApiKey: string;
  voiceId: string;
  voiceEngine?: 'browser' | 'elevenlabs'; // 'browser' = 100% Free Web Speech API (zero keys/cost)
  language: string; // e.g. 'hi', 'mr', 'en'
  speed: number; // 0.75 to 1.5
  isHandsFree: boolean; // VAD mode vs Push-To-Talk
  bargeInEnabled: boolean; // user speech interrupts agent speech
  autoDetectLanguage: boolean;
  consentGranted: boolean;
}

export interface VoiceSessionCallbacks {
  onStateChange?: (state: VoiceSessionState) => void;
  onTranscript?: (transcript: string, isFinal: boolean, confidence: number) => void;
  onSpokenOutput?: (text: string) => void;
  onError?: (errorMessage: string, code?: string) => void;
  onLanguageDetected?: (langCode: string, langName: string) => void;
}

export interface EchoTestResult {
  success: boolean;
  transcription?: string;
  audioPlaybackStarted?: boolean;
  latencyMs?: number;
  error?: string;
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VoiceSessionManager } from './voiceSession';
import { ElevenLabsScribeProvider } from './scribeStt';
import { ElevenLabsTtsProvider } from './elevenLabsTts';
import { SttProvider, TtsProvider, VoiceConfig, SttResult } from './types';
import { normalizeLanguageCode, getOptimalTtsModel, SUPPORTED_LANGUAGES } from './languages';

describe('M10a Conversational Voice I/O Loop', () => {
  let mockStt: SttProvider;
  let mockTts: TtsProvider;
  let config: VoiceConfig;

  beforeEach(() => {
    config = {
      elevenLabsApiKey: 'test-eleven-key-12345',
      voiceId: '21m00Tcm4TlvDq8ikWAM',
      language: 'hi',
      speed: 1.0,
      isHandsFree: false,
      bargeInEnabled: true,
      autoDetectLanguage: true,
      consentGranted: true,
    };

    mockStt = {
      transcribe: vi.fn().mockResolvedValue({
        text: 'मेरा नाम अदिति शर्मा है',
        confidence: 0.95,
        detectedLanguage: 'hi',
      } as SttResult),
    };

    mockTts = {
      synthesize: vi.fn().mockResolvedValue(new ArrayBuffer(1024)),
      play: vi.fn().mockImplementation((_buf, onEnded) => {
        onEnded?.();
        return Promise.resolve();
      }),
      stop: vi.fn(),
      setSpeed: vi.fn(),
      isPlaying: vi.fn().mockReturnValue(false),
      clearCache: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Language & Model Configuration', () => {
    it('normalizes language codes to supported ISO 639-1 mappings', () => {
      expect(normalizeLanguageCode('hi-IN')).toBe('hi');
      expect(normalizeLanguageCode('mr-IN')).toBe('mr');
      expect(normalizeLanguageCode('en-US')).toBe('en');
      expect(normalizeLanguageCode('unknown')).toBe('en');
    });

    it('selects lowest-latency turbo model for English & Hindi, and multilingual for Marathi', () => {
      expect(getOptimalTtsModel('en')).toBe('eleven_turbo_v2_5');
      expect(getOptimalTtsModel('hi')).toBe('eleven_turbo_v2_5');
      expect(getOptimalTtsModel('mr')).toBe('eleven_multilingual_v2');
      expect(SUPPORTED_LANGUAGES['mr'].nativeName).toBe('मराठी');
      expect(SUPPORTED_LANGUAGES['hi'].nativeName).toBe('हिन्दी');
    });
  });

  describe('2. ElevenLabs Scribe STT Provider', () => {
    it('throws error when API key is missing', async () => {
      const provider = new ElevenLabsScribeProvider('');
      const dummyBlob = new Blob(['audio-data'], { type: 'audio/webm' });
      await expect(provider.transcribe(dummyBlob)).rejects.toThrow('ElevenLabs API key is missing');
    });

    it('throws error when audio blob is empty', async () => {
      const provider = new ElevenLabsScribeProvider('valid-key');
      const emptyBlob = new Blob([], { type: 'audio/webm' });
      await expect(provider.transcribe(emptyBlob)).rejects.toThrow('Recorded audio is empty');
    });

    it('correctly posts multipart/form-data with scribe_v1 and parses confidence', async () => {
      const provider = new ElevenLabsScribeProvider('test-key');
      const dummyBlob = new Blob(['dummy-speech'], { type: 'audio/webm' });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          text: 'कृपया माझे उत्पन्न प्रमाणपत्र जोडा',
          language_code: 'mr',
          language_probability: 0.94,
          words: [
            { text: 'कृपया', start: 0.1, end: 0.4 },
            { text: 'उत्पन्न', start: 0.5, end: 0.9 },
          ],
        }),
      } as any);

      const res = await provider.transcribe(dummyBlob, 'mr');
      expect(res.text).toBe('कृपया माझे उत्पन्न प्रमाणपत्र जोडा');
      expect(res.detectedLanguage).toBe('mr');
      expect(res.confidence).toBe(0.94);
      expect(res.words).toHaveLength(2);
    });

    it('handles 429 quota exhaustion gracefully', async () => {
      const provider = new ElevenLabsScribeProvider('test-key');
      const dummyBlob = new Blob(['speech'], { type: 'audio/webm' });

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: async () => ({ message: 'Quota exceeded for current tier' }),
      } as any);

      await expect(provider.transcribe(dummyBlob)).rejects.toThrow('quota exhausted');
    });
  });

  describe('3. ElevenLabs TTS Provider with Caching', () => {
    it('synthesizes and caches audio buffer by voice, language, and text', async () => {
      const tts = new ElevenLabsTtsProvider('test-key');
      const mockBuffer = new ArrayBuffer(512);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => mockBuffer,
      } as any);

      // First call -> network fetch
      const res1 = await tts.synthesize('नमस्ते, मी फॉर्मपायलट आहे.', {
        voiceId: '21m00Tcm4TlvDq8ikWAM',
        language: 'mr',
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(res1).toBe(mockBuffer);

      // Second identical call -> returns from memory cache without network fetch
      const res2 = await tts.synthesize('नमस्ते, मी फॉर्मपायलट आहे.', {
        voiceId: '21m00Tcm4TlvDq8ikWAM',
        language: 'mr',
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(res2).toBe(mockBuffer);
    });

    it('updates speed setting cleanly', () => {
      const tts = new ElevenLabsTtsProvider('test-key');
      tts.setSpeed(1.2);
      // Speed clamped within safe range
      tts.setSpeed(3.0); // should clamp to 2.0
    });
  });

  describe('4. VoiceSessionManager State Transitions & Barge-in', () => {
    it('manages state transitions correctly during speak', async () => {
      const states: string[] = [];
      const session = new VoiceSessionManager(
        config,
        {
          onStateChange: (s) => states.push(s),
        },
        mockStt,
        mockTts
      );

      expect(session.getState()).toBe('idle');

      await session.speak('नमस्कार, मी तुमची कशी मदत करू?');
      expect(states).toContain('speaking');
      expect(states).toContain('idle');
      expect(mockTts.synthesize).toHaveBeenCalledWith('नमस्कार, मी तुमची कशी मदत करू?', expect.anything());
    });

    it('executes barge-in interruption: immediately stops TTS audio when new speech starts', async () => {
      const session = new VoiceSessionManager(config, {}, mockStt, mockTts);

      // Set TTS playing state to true
      (mockTts.isPlaying as any).mockReturnValue(true);

      // User speaks / starts listening -> Barge-in triggered
      session.stopAll();
      expect(mockTts.stop).toHaveBeenCalled();
    });

    it('completes full Echo Test loop with latency measurement', async () => {
      const transcripts: string[] = [];
      const session = new VoiceSessionManager(
        config,
        {
          onTranscript: (t) => transcripts.push(t),
        },
        mockStt,
        mockTts
      );

      // Mock requestMicPermission & mediaStream
      (session as any).mediaStream = { getTracks: () => [] };
      vi.spyOn(session, 'requestMicPermission').mockResolvedValue(true);

      // Mock MediaRecorder
      const mockRecorderInstance: any = {
        state: 'inactive',
        start: vi.fn().mockImplementation(function (this: any) {
          this.state = 'recording';
        }),
        stop: vi.fn().mockImplementation(function (this: any) {
          this.state = 'inactive';
          this.ondataavailable?.({ data: new Blob(['audio-echo-bytes'], { type: 'audio/webm' }) });
          this.onstop?.();
        }),
      };

      global.MediaRecorder = vi.fn().mockImplementation(() => mockRecorderInstance) as any;
      (global.MediaRecorder as any).isTypeSupported = vi.fn().mockReturnValue(true);

      const echoPromise = session.runEchoTest(50);
      mockRecorderInstance.stop();

      const result = await echoPromise;
      expect(result.success).toBe(true);
      expect(result.transcription).toContain('अदिति शर्मा');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(mockTts.synthesize).toHaveBeenCalled();
    });
  });
});

import {
  VoiceSessionState,
  VoiceConfig,
  VoiceSessionCallbacks,
  EchoTestResult,
  SttProvider,
  TtsProvider,
} from './types';
import { ElevenLabsScribeProvider } from './scribeStt';
import { ElevenLabsTtsProvider } from './elevenLabsTts';
import { BrowserSpeechTtsProvider } from './browserTts';
import { SUPPORTED_LANGUAGES, normalizeLanguageCode, getAcknowledgePhrase } from './languages';

export class VoiceSessionManager {
  private state: VoiceSessionState = 'idle';
  private config: VoiceConfig;
  private callbacks: VoiceSessionCallbacks;

  private sttProvider: SttProvider;
  private ttsProvider: TtsProvider;
  private browserTtsProvider: BrowserSpeechTtsProvider;

  // Audio recording & VAD state
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private vadAnimationId: number | null = null;
  private isSpeechDetected = false;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    config: VoiceConfig,
    callbacks: VoiceSessionCallbacks = {},
    customStt?: SttProvider,
    customTts?: TtsProvider
  ) {
    this.config = config;
    this.callbacks = callbacks;

    this.sttProvider = customStt || new ElevenLabsScribeProvider(config.elevenLabsApiKey);
    this.ttsProvider = customTts || new ElevenLabsTtsProvider(config.elevenLabsApiKey);
    this.browserTtsProvider = new BrowserSpeechTtsProvider(config.speed);
  }

  public getState(): VoiceSessionState {
    return this.state;
  }

  public updateConfig(newConfig: Partial<VoiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    if (newConfig.elevenLabsApiKey && this.sttProvider instanceof ElevenLabsScribeProvider) {
      this.sttProvider.setApiKey(newConfig.elevenLabsApiKey);
    }
    if (newConfig.elevenLabsApiKey && this.ttsProvider instanceof ElevenLabsTtsProvider) {
      this.ttsProvider.setApiKey(newConfig.elevenLabsApiKey);
    }
    if (newConfig.speed !== undefined) {
      this.ttsProvider.setSpeed(newConfig.speed);
      this.browserTtsProvider.setSpeed(newConfig.speed);
    }
  }

  private transitionTo(newState: VoiceSessionState): void {
    this.state = newState;
    this.callbacks.onStateChange?.(newState);
  }

  /**
   * Initializes microphone access with permission error handling.
   */
  public async requestMicPermission(): Promise<boolean> {
    try {
      if (this.mediaStream && this.mediaStream.active && this.mediaStream.getAudioTracks().some((t) => t.readyState === 'live')) {
        return true;
      }
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (this.state === 'permission_needed') {
        this.transitionTo('idle');
      }
      return true;
    } catch (err: any) {
      console.warn('[VoiceSessionManager] Mic permission error:', err);
      this.transitionTo('permission_needed');
      this.callbacks.onError?.(
        'Chrome blocks microphone permission popups inside Side Panels. Click "Allow Microphone in Chrome" to grant access.',
        'MIC_PERMISSION_DENIED'
      );
      // Auto-open permission tab if running inside Chrome extension
      if (
        typeof chrome !== 'undefined' &&
        chrome.tabs?.create &&
        (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
      ) {
        chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') }).catch(() => {});
      }
      return false;
    }
  }

  /**
   * Starts listening (either push-to-talk press or hands-free activation).
   */
  public async startListening(): Promise<void> {
    if (this.state === 'listening') return;

    // Barge-in: if currently speaking, stop immediately
    if (this.state === 'speaking') {
      this.ttsProvider.stop();
    }

    const hasMic = await this.requestMicPermission();
    if (!hasMic || !this.mediaStream) {
      return;
    }

    this.audioChunks = [];
    this.isSpeechDetected = false;

    try {
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : 'audio/webm';

      this.mediaRecorder = new MediaRecorder(this.mediaStream, { mimeType });

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        await this.handleRecordingComplete();
      };

      this.mediaRecorder.start(250); // Emit audio data every 250ms
      this.transitionTo('listening');

      // Initialize VAD if hands-free mode is enabled
      if (this.config.isHandsFree) {
        this.startVoiceActivityDetection();
      }
    } catch (err: any) {
      this.transitionTo('error');
      this.callbacks.onError?.(`Failed to start audio recording: ${err?.message || err}`);
    }
  }

  /**
   * Stops listening (e.g. push-to-talk release or VAD silence timeout).
   */
  public stopListening(): void {
    if (this.state !== 'listening') return;

    this.stopVoiceActivityDetection();

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.transitionTo('thinking');
      this.mediaRecorder.stop();
    } else {
      this.transitionTo('idle');
    }
  }

  /**
   * Internal handler when audio recording ends. Sends audio to ElevenLabs Scribe STT.
   */
  private async handleRecordingComplete(): Promise<void> {
    if (this.audioChunks.length === 0) {
      this.transitionTo('idle');
      return;
    }

    const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
    const audioBlob = new Blob(this.audioChunks, { type: mimeType });
    this.audioChunks = [];

    // Skip tiny recordings (under 0.3s)
    if (audioBlob.size < 2000) {
      this.transitionTo(this.config.isHandsFree ? 'listening' : 'idle');
      return;
    }

    try {
      this.transitionTo('thinking');
      const sttResult = await this.sttProvider.transcribe(audioBlob, this.config.language);

      this.callbacks.onTranscript?.(sttResult.text, true, sttResult.confidence);

      // Auto-detect language switch if enabled
      if (
        this.config.autoDetectLanguage &&
        sttResult.detectedLanguage &&
        sttResult.detectedLanguage !== this.config.language &&
        sttResult.confidence >= 0.8
      ) {
        const normLang = normalizeLanguageCode(sttResult.detectedLanguage);
        if (normLang !== this.config.language) {
          const langInfo = SUPPORTED_LANGUAGES[normLang];
          this.config.language = normLang;
          this.callbacks.onLanguageDetected?.(normLang, langInfo?.name || normLang);
        }
      }

      // Voice feedback: speak back acknowledged speech
      if (sttResult.text) {
        const spokenConfirmation = getAcknowledgePhrase(this.config.language, sttResult.text);
        await this.speak(spokenConfirmation);
      } else {
        this.transitionTo('idle');
      }

      // In hands-free mode, restart listening loop unless speaking
      if (this.config.isHandsFree && this.state !== 'speaking') {
        setTimeout(() => {
          if (this.config.isHandsFree && this.state === 'idle') {
            this.startListening();
          }
        }, 500);
      }
    } catch (err: any) {
      this.transitionTo('error');
      this.callbacks.onError?.(err?.message || 'Speech recognition failed.');
    }
  }

  /**
   * Voice Activity Detection (VAD) using AnalyserNode RMS energy monitoring.
   */
  private startVoiceActivityDetection(): void {
    if (!this.mediaStream) return;

    try {
      if (!this.audioContext) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const SPEECH_THRESHOLD = 25; // Energy volume threshold
      const SILENCE_DURATION_MS = 1400; // 1.4 seconds of silence triggers completion

      const checkVolume = () => {
        if (!this.analyser || this.state !== 'listening') return;

        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;

        if (average > SPEECH_THRESHOLD) {
          // If the agent was speaking and user starts talking -> BARGE IN!
          if (this.ttsProvider.isPlaying()) {
            this.ttsProvider.stop();
          }

          this.isSpeechDetected = true;
          if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
          }
        } else if (this.isSpeechDetected) {
          // Speech was active, now silence
          if (!this.silenceTimer) {
            this.silenceTimer = setTimeout(() => {
              if (this.isSpeechDetected && this.state === 'listening') {
                this.stopListening();
              }
            }, SILENCE_DURATION_MS);
          }
        }

        this.vadAnimationId = requestAnimationFrame(checkVolume);
      };

      this.vadAnimationId = requestAnimationFrame(checkVolume);
    } catch (err) {
      console.warn('[VAD] Voice activity detection fallback:', err);
    }
  }

  private stopVoiceActivityDetection(): void {
    if (this.vadAnimationId) {
      cancelAnimationFrame(this.vadAnimationId);
      this.vadAnimationId = null;
    }
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  /**
   * Speaks the response text via free Browser Speech or ElevenLabs TTS with state transition to 'speaking'.
   * If ElevenLabs returns 402 (payment required for voice) or 429 quota exhaustion,
   * automatically falls back to 100% free Browser SpeechSynthesis.
   */
  public async speak(text: string): Promise<void> {
    if (!text.trim()) return;

    this.transitionTo('speaking');
    this.callbacks.onSpokenOutput?.(text);

    const onEnded = () => {
      this.transitionTo('idle');
      if (this.config.isHandsFree) {
        setTimeout(() => {
          if (this.config.isHandsFree && this.state === 'idle') {
            this.startListening();
          }
        }, 300);
      }
    };

    try {
      // 1. If configured for free browser engine or no ElevenLabs key, speak via free browser TTS
      if (this.config.voiceEngine === 'browser' || !this.config.elevenLabsApiKey) {
        await this.browserTtsProvider.speakText(
          text,
          { language: this.config.language, speed: this.config.speed },
          onEnded
        );
        return;
      }

      // 2. Otherwise synthesize via ElevenLabs, with seamless fallback to free browser TTS on 402/429
      try {
        const audioBuffer = await this.ttsProvider.synthesize(text, {
          voiceId: this.config.voiceId,
          language: this.config.language,
          speed: this.config.speed,
        });

        await this.ttsProvider.play(audioBuffer, onEnded);
      } catch (elevenErr: any) {
        const errMsg = String(elevenErr?.message || '');
        if (
          errMsg.includes('402') ||
          errMsg.includes('Free users cannot use') ||
          errMsg.includes('429') ||
          errMsg.includes('quota') ||
          errMsg.includes('401')
        ) {
          console.warn('[VoiceSession] ElevenLabs voice restriction (402/429). Falling back to free browser voice:', errMsg);
          await this.browserTtsProvider.speakText(
            text,
            { language: this.config.language, speed: this.config.speed },
            onEnded
          );
        } else {
          throw elevenErr;
        }
      }
    } catch (err: any) {
      this.transitionTo('error');
      this.callbacks.onError?.(`TTS playback error: ${err?.message || err}`);
    }
  }

  /**
   * Stops any ongoing playback or recording.
   */
  public stopAll(): void {
    this.ttsProvider.stop();
    this.browserTtsProvider.stop();
    this.stopVoiceActivityDetection();
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {}
    }
    this.transitionTo('idle');
  }

  /**
   * Repeats the last spoken audio phrase.
   */
  public async repeatLastSpoken(): Promise<void> {
    this.transitionTo('speaking');
    try {
      if (this.config.voiceEngine === 'browser' || !this.config.elevenLabsApiKey) {
        await this.browserTtsProvider.repeatLastSpoken();
      } else if (this.ttsProvider.repeatLastSpoken) {
        await this.ttsProvider.repeatLastSpoken();
      }
    } finally {
      this.transitionTo('idle');
    }
  }

  /**
   * Slows down speech playback rate and repeats.
   */
  public async slowerPlease(): Promise<void> {
    this.transitionTo('speaking');
    try {
      if (this.config.voiceEngine === 'browser' || !this.config.elevenLabsApiKey) {
        await this.browserTtsProvider.slowerPlease();
      } else if (this.ttsProvider.slowerPlease) {
        await this.ttsProvider.slowerPlease();
      }
    } finally {
      this.transitionTo('idle');
    }
  }

  /**
   * Runs an Echo Test ("say something and hear it back"):
   * 1. Records user audio
   * 2. Transcribes via ElevenLabs Scribe
   * 3. Plays back the transcription via ElevenLabs TTS
   */
  public async runEchoTest(recordDurationMs = 3500): Promise<EchoTestResult> {
    const startTime = Date.now();

    const hasMic = await this.requestMicPermission();
    if (!hasMic || !this.mediaStream) {
      return { success: false, error: 'Microphone permission denied or unavailable.' };
    }

    return new Promise<EchoTestResult>((resolve) => {
      this.audioChunks = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(this.mediaStream!, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.audioChunks.push(e.data);
      };

      recorder.onstop = async () => {
        try {
          const audioBlob = new Blob(this.audioChunks, { type: mimeType });
          this.transitionTo('thinking');

          const sttRes = await this.sttProvider.transcribe(audioBlob, this.config.language);
          const transcription = sttRes.text || 'Echo test audio heard.';

          this.callbacks.onTranscript?.(transcription, true, sttRes.confidence);

          // Synthesize & speak back
          const echoResponseText = `You said: ${transcription}`;
          await this.speak(echoResponseText);

          const totalLatency = Date.now() - startTime;
          resolve({
            success: true,
            transcription,
            audioPlaybackStarted: true,
            latencyMs: totalLatency,
          });
        } catch (err: any) {
          this.transitionTo('error');
          resolve({
            success: false,
            error: err?.message || 'Echo test failed.',
          });
        }
      };

      this.transitionTo('listening');
      recorder.start();

      setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      }, recordDurationMs);
    });
  }

  public destroy(): void {
    this.stopAll();
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

import { TtsProvider, TtsOptions } from './types';
import { getOptimalTtsModel } from './languages';

export class ElevenLabsTtsProvider implements TtsProvider {
  private apiKey: string;
  private audioCache = new Map<string, ArrayBuffer>();
  private audioContext: AudioContext | null = null;
  private currentSourceNode: AudioBufferSourceNode | null = null;
  private currentAudioElement: HTMLAudioElement | null = null;
  private currentBlobUrl: string | null = null;
  private currentSpeed = 1.0;
  private lastSpokenText: string | null = null;
  private lastSpokenOptions: TtsOptions | null = null;
  private playing = false;

  constructor(apiKey: string) {
    this.apiKey = apiKey.trim();
  }

  public setApiKey(apiKey: string): void {
    this.apiKey = apiKey.trim();
  }

  public getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      if (!this.audioContext) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) this.audioContext = new AudioCtx();
      }
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }
      return this.audioContext;
    } catch {
      return null;
    }
  }

  public setSpeed(speed: number): void {
    this.currentSpeed = Math.min(2.0, Math.max(0.5, speed));
    if (this.currentAudioElement) {
      this.currentAudioElement.playbackRate = this.currentSpeed;
    }
    if (this.currentSourceNode) {
      try {
        this.currentSourceNode.playbackRate.value = this.currentSpeed;
      } catch {}
    }
  }

  public isPlaying(): boolean {
    return this.playing;
  }

  public getLastSpokenText(): string | null {
    return this.lastSpokenText;
  }

  public clearCache(): void {
    this.audioCache.clear();
  }

  private makeCacheKey(text: string, options: TtsOptions): string {
    const lang = options.language || 'en';
    const voice = options.voiceId || 'default';
    const speed = (options.speed || this.currentSpeed).toFixed(2);
    return `${voice}::${lang}::${speed}::${text.trim().toLowerCase()}`;
  }

  /**
   * Synthesizes text to speech via ElevenLabs TTS API with local in-memory caching.
   */
  public async synthesize(text: string, options: TtsOptions): Promise<ArrayBuffer> {
    if (!this.apiKey) {
      throw new Error('ElevenLabs API key is missing. Please enter your key in FormPilot Settings.');
    }

    const cleanText = text.trim();
    if (!cleanText) {
      throw new Error('Text to synthesize is empty.');
    }

    const cacheKey = this.makeCacheKey(cleanText, options);
    if (this.audioCache.has(cacheKey)) {
      return this.audioCache.get(cacheKey)!;
    }

    const modelId = options.modelId || getOptimalTtsModel(options.language || 'en');
    const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${options.voiceId}`;

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: cleanText,
          model_id: modelId,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.8,
            speed: options.speed || this.currentSpeed,
          },
        }),
      });
    } catch (netErr: any) {
      throw new Error(`Network error contacting ElevenLabs TTS: ${netErr?.message || 'Check your internet connection.'}`);
    }

    if (!response.ok) {
      const status = response.status;
      let errorBody = '';
      try {
        const json = await response.json();
        errorBody = json.detail?.message || json.message || JSON.stringify(json);
      } catch {
        errorBody = await response.text();
      }

      if (status === 401 || status === 403) {
        throw new Error('Invalid ElevenLabs API key or unauthorized. Please verify your key in Settings.');
      }
      if (status === 429) {
        throw new Error('ElevenLabs quota exceeded or rate limit reached. Please check your account quota.');
      }
      throw new Error(`ElevenLabs TTS failed (${status}): ${errorBody || response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    this.audioCache.set(cacheKey, arrayBuffer);
    this.lastSpokenText = cleanText;
    this.lastSpokenOptions = { ...options, speed: options.speed || this.currentSpeed };

    return arrayBuffer;
  }

  /**
   * Plays audio buffer with barge-in support (can be stopped immediately at any time).
   * Uses Web Audio API first (immune to autoplay restrictions once context is running),
   * with fallback to HTMLAudioElement.
   */
  public async play(audioData: ArrayBuffer, onEnded?: () => void): Promise<void> {
    this.stop(); // Stop any active playback immediately for barge-in
    this.playing = true;

    // 1. Try Web Audio API first if supported
    const ctx = this.getAudioContext();
    if (ctx && typeof ctx.decodeAudioData === 'function') {
      try {
        if (ctx.state === 'suspended') {
          await ctx.resume().catch(() => {});
        }

        const bufferCopy = audioData.slice(0);
        const decodedBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
          ctx.decodeAudioData(bufferCopy, resolve, reject);
        });

        const source = ctx.createBufferSource();
        source.buffer = decodedBuffer;
        source.playbackRate.value = this.currentSpeed;
        source.connect(ctx.destination);
        this.currentSourceNode = source;

        return new Promise((resolve) => {
          source.onended = () => {
            this.cleanup();
            onEnded?.();
            resolve();
          };
          source.start(0);
        });
      } catch (webAudioErr) {
        console.warn('[ElevenLabsTTS] Web Audio play failed, falling back to HTMLAudioElement:', webAudioErr);
      }
    }

    // 2. Fallback to HTMLAudioElement
    return new Promise((resolve, reject) => {
      try {
        const blob = new Blob([audioData], { type: 'audio/mpeg' });
        this.currentBlobUrl = URL.createObjectURL(blob);
        const audio = new Audio(this.currentBlobUrl);
        this.currentAudioElement = audio;
        audio.playbackRate = this.currentSpeed;

        audio.onended = () => {
          this.cleanup();
          onEnded?.();
          resolve();
        };

        audio.onerror = () => {
          this.cleanup();
          reject(new Error('Audio playback failed in browser.'));
        };

        audio.play().catch((err) => {
          this.cleanup();
          // AbortError is normal when stop() is called immediately for barge-in
          if (err.name === 'AbortError') {
            resolve();
          } else {
            reject(err);
          }
        });
      } catch (err) {
        this.cleanup();
        reject(err);
      }
    });
  }

  /**
   * Immediately halts current audio playback. Essential for barge-in support when user speaks.
   */
  public stop(): void {
    if (this.currentSourceNode) {
      try {
        this.currentSourceNode.stop();
        this.currentSourceNode.disconnect();
      } catch {
        // Safe ignore
      }
      this.currentSourceNode = null;
    }
    if (this.currentAudioElement) {
      try {
        this.currentAudioElement.pause();
        this.currentAudioElement.currentTime = 0;
      } catch {
        // Safe ignore
      }
    }
    this.cleanup();
  }

  /**
   * Replays the last spoken text.
   */
  public async repeatLastSpoken(): Promise<void> {
    if (this.lastSpokenText && this.lastSpokenOptions) {
      const audio = await this.synthesize(this.lastSpokenText, this.lastSpokenOptions);
      await this.play(audio);
    }
  }

  /**
   * Slows down speech speed by 15% and repeats.
   */
  public async slowerPlease(): Promise<void> {
    this.currentSpeed = Math.max(0.6, this.currentSpeed - 0.15);
    if (this.lastSpokenText && this.lastSpokenOptions) {
      const options = { ...this.lastSpokenOptions, speed: this.currentSpeed };
      const audio = await this.synthesize(this.lastSpokenText, options);
      await this.play(audio);
    }
  }

  private cleanup(): void {
    this.playing = false;
    this.currentSourceNode = null;
    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
      this.currentBlobUrl = null;
    }
    this.currentAudioElement = null;
  }
}

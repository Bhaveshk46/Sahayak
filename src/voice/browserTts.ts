import { TtsProvider, TtsOptions } from './types';

/**
 * 100% Free Browser Speech Synthesis Provider (Web Speech API).
 * Requires zero API keys, zero subscriptions, has no character quotas,
 * and works offline or with Google's built-in high quality voices in Chrome.
 */
export class BrowserSpeechTtsProvider implements TtsProvider {
  private currentSpeed = 1.0;
  private playing = false;
  private lastSpokenText: string | null = null;
  private lastSpokenOptions: TtsOptions | null = null;

  constructor(speed = 1.0) {
    this.currentSpeed = Math.min(2.0, Math.max(0.5, speed));
  }

  public setSpeed(speed: number): void {
    this.currentSpeed = Math.min(2.0, Math.max(0.5, speed));
  }

  public isPlaying(): boolean {
    return this.playing;
  }

  public clearCache(): void {
    // No cache needed for browser synthesis
  }

  public async synthesize(text: string, options: TtsOptions): Promise<ArrayBuffer> {
    this.lastSpokenText = text;
    this.lastSpokenOptions = options;
    return new ArrayBuffer(0);
  }

  public async play(_audioData: ArrayBuffer, onEnded?: () => void): Promise<void> {
    if (!this.lastSpokenText) {
      onEnded?.();
      return;
    }
    await this.speakText(this.lastSpokenText, this.lastSpokenOptions || {}, onEnded);
  }

  /**
   * Speaks text using browser window.speechSynthesis.
   */
  public async speakText(text: string, options: TtsOptions, onEnded?: () => void): Promise<void> {
    this.stop();

    const cleanText = text.trim();
    if (!cleanText) {
      onEnded?.();
      return;
    }

    this.lastSpokenText = cleanText;
    this.lastSpokenOptions = options;

    if (typeof window === 'undefined' || !window.speechSynthesis) {
      console.warn('[BrowserTTS] window.speechSynthesis is not available.');
      onEnded?.();
      return;
    }

    this.playing = true;

    return new Promise((resolve) => {
      try {
        const utterance = new SpeechSynthesisUtterance(cleanText);
        const lang = options.language || 'hi';
        const langTag =
          lang === 'hi'
            ? 'hi-IN'
            : lang === 'mr'
            ? 'mr-IN'
            : lang === 'en'
            ? 'en-IN'
            : `${lang}-${lang.toUpperCase()}`;

        utterance.lang = langTag;
        utterance.rate = options.speed || this.currentSpeed;

        // Select best matching voice from available system/browser voices
        const voices = window.speechSynthesis.getVoices();
        if (voices && voices.length > 0) {
          const matchingVoice =
            voices.find((v) => v.lang.toLowerCase().replace('_', '-') === langTag.toLowerCase()) ||
            voices.find((v) => v.lang.toLowerCase().startsWith(lang.toLowerCase())) ||
            voices.find((v) => v.name.toLowerCase().includes('google') && v.lang.startsWith(lang));
          if (matchingVoice) {
            utterance.voice = matchingVoice;
          }
        }

        utterance.onend = () => {
          this.playing = false;
          onEnded?.();
          resolve();
        };

        utterance.onerror = (e) => {
          console.warn('[BrowserTTS] Utterance error or cancelled:', e);
          this.playing = false;
          onEnded?.();
          resolve();
        };

        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn('[BrowserTTS] Failed to speak utterance:', err);
        this.playing = false;
        onEnded?.();
        resolve();
      }
    });
  }

  public stop(): void {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Safe ignore
      }
    }
    this.playing = false;
  }

  public async repeatLastSpoken(): Promise<void> {
    if (this.lastSpokenText) {
      await this.speakText(this.lastSpokenText, this.lastSpokenOptions || {});
    }
  }

  public async slowerPlease(): Promise<void> {
    this.currentSpeed = Math.max(0.6, Number((this.currentSpeed - 0.15).toFixed(2)));
    if (this.lastSpokenText) {
      const opts = { ...(this.lastSpokenOptions || {}), speed: this.currentSpeed };
      await this.speakText(this.lastSpokenText, opts);
    }
  }
}

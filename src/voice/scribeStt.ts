import { SttProvider, SttResult } from './types';
import { normalizeLanguageCode } from './languages';

export class ElevenLabsScribeProvider implements SttProvider {
  private apiKey: string;
  private endpoint = 'https://api.elevenlabs.io/v1/speech-to-text';

  constructor(apiKey: string) {
    this.apiKey = apiKey.trim();
  }

  public setApiKey(apiKey: string): void {
    this.apiKey = apiKey.trim();
  }

  /**
   * Transcribes an audio blob using ElevenLabs Scribe STT API.
   * Never logs user speech audio or transcripts to console.
   */
  public async transcribe(audioBlob: Blob, languageCode?: string): Promise<SttResult> {
    if (!this.apiKey) {
      throw new Error('ElevenLabs API key is missing. Please enter your key in FormPilot Settings.');
    }

    if (!audioBlob || audioBlob.size === 0) {
      throw new Error('Recorded audio is empty.');
    }

    const formData = new FormData();
    const fileExt = audioBlob.type.includes('webm')
      ? 'webm'
      : audioBlob.type.includes('mp4')
      ? 'mp4'
      : audioBlob.type.includes('wav')
      ? 'wav'
      : 'ogg';

    formData.append('file', audioBlob, `speech_recording.${fileExt}`);
    formData.append('model_id', 'scribe_v1');

    if (languageCode && languageCode !== 'auto') {
      formData.append('language_code', languageCode);
    }
    formData.append('tag_audio_events', 'false');

    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
        },
        body: formData,
      });
    } catch (netErr: any) {
      throw new Error(`Network failure during speech recognition: ${netErr?.message || 'Check your internet connection.'}`);
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
        throw new Error('ElevenLabs quota exhausted or rate limit reached. Please check your account quota.');
      }
      throw new Error(`ElevenLabs Scribe failed (${status}): ${errorBody || response.statusText}`);
    }

    const data = await response.json();
    const text = (data.text || '').trim();

    // Calculate confidence from words array or language_probability
    let confidence = 0.9;
    if (typeof data.language_probability === 'number') {
      confidence = Math.min(1.0, Math.max(0.5, data.language_probability));
    }
    if (text.length === 0) {
      confidence = 0.0;
    }

    const detectedLanguage = data.language_code ? normalizeLanguageCode(data.language_code) : undefined;

    return {
      text,
      confidence,
      detectedLanguage,
      words: Array.isArray(data.words)
        ? data.words.map((w: any) => ({
            text: w.text || '',
            start: Number(w.start) || 0,
            end: Number(w.end) || 0,
            type: w.type,
            confidence: typeof w.confidence === 'number' ? w.confidence : 0.9,
          }))
        : undefined,
    };
  }
}

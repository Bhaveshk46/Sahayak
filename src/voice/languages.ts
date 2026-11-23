/**
 * Supported Language definitions based on ElevenLabs Scribe STT and ElevenLabs Multilingual TTS.
 * Prioritizes Indian languages (Hindi, Marathi, English, Tamil, Telugu, etc.).
 */

export interface LanguageInfo {
  code: string; // ISO 639-1 code
  name: string; // English display name
  nativeName: string; // Native script display name
  sttSupported: boolean;
  ttsSupported: boolean;
  preferredTtsModel: 'eleven_turbo_v2_5' | 'eleven_multilingual_v2' | 'eleven_flash_v2_5';
  fallbackTtsModel: 'eleven_multilingual_v2';
  defaultVoiceId: string;
}

export const ELEVENLABS_VOICES = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', description: 'Calm, clear, conversational (Female)' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', description: 'Warm, soft, friendly (Female)' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', description: 'Well-modulated, respectful (Male)' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', description: 'Strong, articulate (Female)' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', description: 'Deep, crisp, confident (Male)' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', description: 'Natural, expressive (Male)' },
];

export const SUPPORTED_LANGUAGES: Record<string, LanguageInfo> = {
  hi: {
    code: 'hi',
    name: 'Hindi',
    nativeName: 'हिन्दी',
    sttSupported: true,
    ttsSupported: true,
    preferredTtsModel: 'eleven_turbo_v2_5',
    fallbackTtsModel: 'eleven_multilingual_v2',
    defaultVoiceId: '21m00Tcm4TlvDq8ikWAM', // Rachel
  },
  mr: {
    code: 'mr',
    name: 'Marathi',
    nativeName: 'मराठी',
    sttSupported: true,
    ttsSupported: true,
    preferredTtsModel: 'eleven_multilingual_v2', // v2 has rich Marathi articulation
    fallbackTtsModel: 'eleven_multilingual_v2',
    defaultVoiceId: '21m00Tcm4TlvDq8ikWAM',
  },
  en: {
    code: 'en',
    name: 'English (Indian / Global)',
    nativeName: 'English',
    sttSupported: true,
    ttsSupported: true,
    preferredTtsModel: 'eleven_turbo_v2_5', // ultra-low latency for English
    fallbackTtsModel: 'eleven_multilingual_v2',
    defaultVoiceId: '21m00Tcm4TlvDq8ikWAM',
  },
  ta: {
    code: 'ta',
    name: 'Tamil',
    nativeName: 'தமிழ்',
    sttSupported: true,
    ttsSupported: true,
    preferredTtsModel: 'eleven_multilingual_v2',
    fallbackTtsModel: 'eleven_multilingual_v2',
    defaultVoiceId: '21m00Tcm4TlvDq8ikWAM',
  },
  te: {
    code: 'te',
    name: 'Telugu',
    nativeName: 'తెలుగు',
    sttSupported: true,
    ttsSupported: true,
    preferredTtsModel: 'eleven_multilingual_v2',
    fallbackTtsModel: 'eleven_multilingual_v2',
    defaultVoiceId: '21m00Tcm4TlvDq8ikWAM',
  },
  bn: {
    code: 'bn',
    name: 'Bengali',
    nativeName: 'বাংলা',
    sttSupported: true,
    ttsSupported: true,
    preferredTtsModel: 'eleven_multilingual_v2',
    fallbackTtsModel: 'eleven_multilingual_v2',
    defaultVoiceId: '21m00Tcm4TlvDq8ikWAM',
  },
  gu: {
    code: 'gu',
    name: 'Gujarati',
    nativeName: 'ગુજરાતી',
    sttSupported: true,
    ttsSupported: true,
    preferredTtsModel: 'eleven_multilingual_v2',
    fallbackTtsModel: 'eleven_multilingual_v2',
    defaultVoiceId: '21m00Tcm4TlvDq8ikWAM',
  },
  kn: {
    code: 'kn',
    name: 'Kannada',
    nativeName: 'ಕನ್ನಡ',
    sttSupported: true,
    ttsSupported: true,
    preferredTtsModel: 'eleven_multilingual_v2',
    fallbackTtsModel: 'eleven_multilingual_v2',
    defaultVoiceId: '21m00Tcm4TlvDq8ikWAM',
  },
  ml: {
    code: 'ml',
    name: 'Malayalam',
    nativeName: 'മലയാളം',
    sttSupported: true,
    ttsSupported: true,
    preferredTtsModel: 'eleven_multilingual_v2',
    fallbackTtsModel: 'eleven_multilingual_v2',
    defaultVoiceId: '21m00Tcm4TlvDq8ikWAM',
  },
  pa: {
    code: 'pa',
    name: 'Punjabi',
    nativeName: 'ਪੰਜਾਬੀ',
    sttSupported: true,
    ttsSupported: true,
    preferredTtsModel: 'eleven_multilingual_v2',
    fallbackTtsModel: 'eleven_multilingual_v2',
    defaultVoiceId: '21m00Tcm4TlvDq8ikWAM',
  },
  ur: {
    code: 'ur',
    name: 'Urdu',
    nativeName: 'اردو',
    sttSupported: true,
    ttsSupported: true,
    preferredTtsModel: 'eleven_multilingual_v2',
    fallbackTtsModel: 'eleven_multilingual_v2',
    defaultVoiceId: '21m00Tcm4TlvDq8ikWAM',
  },
};

/**
 * Resolves the optimal TTS model for the given language.
 */
export function getOptimalTtsModel(langCode: string): string {
  const lang = SUPPORTED_LANGUAGES[langCode] || SUPPORTED_LANGUAGES['en'];
  return lang.preferredTtsModel;
}

/**
 * Resolves the default voice for the given language.
 */
export function getDefaultVoiceForLanguage(langCode: string): string {
  const lang = SUPPORTED_LANGUAGES[langCode] || SUPPORTED_LANGUAGES['en'];
  return lang.defaultVoiceId;
}

/**
 * Normalizes detected language codes from STT to our supported language map.
 */
export function normalizeLanguageCode(code: string): string {
  const lower = code.toLowerCase().trim().slice(0, 2);
  if (SUPPORTED_LANGUAGES[lower]) {
    return lower;
  }
  return 'en';
}

/**
 * Returns a natural greeting sample for audio testing per language.
 */
export function getSampleGreeting(langCode: string): string {
  switch (normalizeLanguageCode(langCode)) {
    case 'hi':
      return 'नमस्ते! फॉर्मपायलट वॉइस असिस्टेंट ठीक से काम कर रहा है।';
    case 'mr':
      return 'नमस्कार! फॉर्मपायलट व्हॉइस असिस्टंट व्यवस्थित काम करत आहे.';
    case 'en':
      return 'Hello! FormPilot voice assistant is working properly. I am ready to help you with the form.';
    case 'ta':
      return 'வணக்கம்! FormPilot குரல் உதவியாளர் சரியாக வேலை செய்கிறது.';
    case 'te':
      return 'నమస్కారం! FormPilot వాయిస్ అసిస్టెంట్ సరిగ్గా పనిచేస్తోంది.';
    case 'bn':
      return 'নমস্কার! ফর্মপাইলট ভয়েস অ্যাসিস্ট্যান্ট সঠিকভাবে কাজ করছে।';
    case 'gu':
      return 'નમસ્તે! ફોર્મપાઇલટ વોઇસ સહાયક યોગ્ય રીતે કાર્ય કરી રહ્યું છે.';
    case 'kn':
      return 'ನಮಸ್ಕಾರ! FormPilot ಧ್ವನಿ ಸಹಾಯಕ ಸಿದ್ಧವಾಗಿದೆ.';
    case 'ml':
      return 'നമസ്കാരം! FormPilot വോയ്‌സ് അസിസ്റ്റന്റ് സജ്ജമാണ്.';
    case 'pa':
      return 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ! FormPilot ਵੌਇਸ ਅਸਿਸਟੈਂਟ ਤਿਆਰ ਹੈ।';
    default:
      return 'Hello! FormPilot voice assistant is working properly.';
  }
}

/**
 * Generates voice acknowledgment phrase for speech feedback.
 */
export function getAcknowledgePhrase(langCode: string, recognizedText: string): string {
  switch (normalizeLanguageCode(langCode)) {
    case 'hi':
      return `मैंने सुना: "${recognizedText}"।`;
    case 'mr':
      return `मी ऐकले: "${recognizedText}".`;
    case 'en':
      return `I heard: "${recognizedText}".`;
    default:
      return `I heard: "${recognizedText}".`;
  }
}

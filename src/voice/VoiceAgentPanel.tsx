import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  Volume2,
  VolumeX,
  RotateCcw,
  Activity,
  AlertCircle,
  Square,
  Globe,
  Edit2,
  Check,
} from 'lucide-react';
import { VoiceSessionManager } from './voiceSession';
import { VoiceSessionState, EchoTestResult, VoiceConfig } from './types';
import { SUPPORTED_LANGUAGES, getSampleGreeting } from './languages';
import { VoiceConsentModal } from './VoiceConsentModal';

interface VoiceAgentPanelProps {
  apiKey?: string;
  onOpenSettings?: () => void;
}

export const VoiceAgentPanel: React.FC<VoiceAgentPanelProps> = ({
  apiKey = '',
  onOpenSettings,
}) => {
  const [activeApiKey, setActiveApiKey] = useState(apiKey);
  const [inlineKeyInput, setInlineKeyInput] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [state, setState] = useState<VoiceSessionState>('idle');
  const [transcript, setTranscript] = useState('');
  const [editableTranscript, setEditableTranscript] = useState('');
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [transcriptConfidence, setTranscriptConfidence] = useState<number>(0);
  const [spokenText, setSpokenText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [language, setLanguage] = useState('hi'); // Default Hindi
  const [voiceEngine, setVoiceEngine] = useState<'browser' | 'elevenlabs'>('browser'); // Default 100% Free
  const [isHandsFree, setIsHandsFree] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  const [selectedVoice, setSelectedVoice] = useState('21m00Tcm4TlvDq8ikWAM'); // Rachel

  // Echo Test State
  const [runningEchoTest, setRunningEchoTest] = useState(false);
  const [echoResult, setEchoResult] = useState<EchoTestResult | null>(null);
  const [playingSample, setPlayingSample] = useState(false);

  const sessionManagerRef = useRef<VoiceSessionManager | null>(null);

  useEffect(() => {
    if (apiKey) setActiveApiKey(apiKey);
  }, [apiKey]);

  useEffect(() => {
    // Load persisted voice preferences
    chrome.storage.local.get(
      [
        'formpilot_voice_enabled',
        'formpilot_voice_consent',
        'formpilot_voice_lang',
        'formpilot_voice_engine',
        'formpilot_voice_hands_free',
        'formpilot_voice_speed',
        'formpilot_voice_id',
        'elevenLabsApiKey',
      ],
      (res) => {
        if (res.elevenLabsApiKey) setActiveApiKey(res.elevenLabsApiKey);
        if (res.formpilot_voice_engine) setVoiceEngine(res.formpilot_voice_engine);
        if (res.formpilot_voice_lang) setLanguage(res.formpilot_voice_lang);
        if (res.formpilot_voice_hands_free !== undefined) setIsHandsFree(Boolean(res.formpilot_voice_hands_free));
        if (res.formpilot_voice_speed) setSpeed(Number(res.formpilot_voice_speed));
        if (res.formpilot_voice_id) setSelectedVoice(res.formpilot_voice_id);
        if (res.formpilot_voice_enabled && res.formpilot_voice_consent) {
          setVoiceEnabled(true);
        }
      }
    );

    const storageListener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === 'local') {
        if (changes.elevenLabsApiKey) {
          setActiveApiKey(changes.elevenLabsApiKey.newValue || '');
        }
        if (changes.formpilot_voice_enabled !== undefined) {
          setVoiceEnabled(Boolean(changes.formpilot_voice_enabled.newValue));
        }
        if (changes.formpilot_mic_granted) {
          setErrorMessage('');
          setState('idle');
          sessionManagerRef.current?.requestMicPermission().then((ok) => {
            if (ok) setState('idle');
          });
        }
      }
    };
    chrome.storage.onChanged.addListener(storageListener);

    const runtimeMessageListener = (message: any) => {
      if (message.type === 'MIC_PERMISSION_GRANTED') {
        setErrorMessage('');
        setState('idle');
        sessionManagerRef.current?.requestMicPermission().then((ok) => {
          if (ok) setState('idle');
        });
      }
    };
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(runtimeMessageListener);
    }

    return () => {
      chrome.storage.onChanged.removeListener(storageListener);
      if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.removeListener(runtimeMessageListener);
      }
    };
  }, []);

  // Initialize or update VoiceSessionManager
  useEffect(() => {
    if (!voiceEnabled) {
      if (sessionManagerRef.current) {
        sessionManagerRef.current.destroy();
        sessionManagerRef.current = null;
      }
      return;
    }

    const config: VoiceConfig = {
      elevenLabsApiKey: activeApiKey,
      voiceId: selectedVoice,
      voiceEngine,
      language,
      speed,
      isHandsFree,
      bargeInEnabled: true,
      autoDetectLanguage: true,
      consentGranted: true,
    };

    if (!sessionManagerRef.current) {
      sessionManagerRef.current = new VoiceSessionManager(config, {
        onStateChange: (newState) => setState(newState),
        onTranscript: (text, _isFinal, confidence) => {
          setTranscript(text);
          setEditableTranscript(text);
          setTranscriptConfidence(confidence);
        },
        onSpokenOutput: (text) => setSpokenText(text),
        onError: (err) => setErrorMessage(err),
        onLanguageDetected: (code) => {
          setLanguage(code);
        },
      });
    } else {
      sessionManagerRef.current.updateConfig(config);
    }
  }, [voiceEnabled, activeApiKey, voiceEngine, language, speed, isHandsFree, selectedVoice]);

  // Handle Voice Toggle
  const handleToggleVoice = () => {
    if (!voiceEnabled) {
      chrome.storage.local.get(['formpilot_voice_consent'], (res) => {
        if (!res.formpilot_voice_consent) {
          setShowConsentModal(true);
        } else {
          setVoiceEnabled(true);
          chrome.storage.local.set({ formpilot_voice_enabled: true });
        }
      });
    } else {
      setVoiceEnabled(false);
      sessionManagerRef.current?.stopAll();
      chrome.storage.local.set({ formpilot_voice_enabled: false });
    }
  };

  const handleOpenPermissionTab = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') });
    } else {
      window.open(chrome.runtime.getURL('permission.html'), '_blank');
    }
  };

  const handleConsentConfirm = () => {
    setShowConsentModal(false);
    setVoiceEnabled(true);
    chrome.storage.local.set({
      formpilot_voice_consent: true,
      formpilot_voice_enabled: true,
    });
    // Check permission - if not granted, open permission tab
    if (sessionManagerRef.current) {
      sessionManagerRef.current.requestMicPermission().then((ok) => {
        if (!ok) handleOpenPermissionTab();
      });
    }
  };

  const handlePushToTalk = async () => {
    if (!sessionManagerRef.current) return;
    if (state === 'permission_needed') {
      handleOpenPermissionTab();
      return;
    }
    if (state === 'listening') {
      sessionManagerRef.current.stopListening();
    } else {
      setErrorMessage('');
      await sessionManagerRef.current.startListening();
    }
  };

  const handleStopAll = () => {
    sessionManagerRef.current?.stopAll();
    setState('idle');
  };

  const handleRunEchoTest = async () => {
    if (!sessionManagerRef.current) return;
    if (state === 'permission_needed') {
      handleOpenPermissionTab();
      return;
    }
    setRunningEchoTest(true);
    setEchoResult(null);
    setErrorMessage('');

    const res = await sessionManagerRef.current.runEchoTest(3500);
    setEchoResult(res);
    setRunningEchoTest(false);
  };

  const handlePlaySample = async () => {
    if (!sessionManagerRef.current) return;
    if (!activeApiKey) {
      setErrorMessage('Please activate your ElevenLabs API key first.');
      return;
    }
    setPlayingSample(true);
    setErrorMessage('');
    try {
      const greeting = getSampleGreeting(language);
      await sessionManagerRef.current.speak(greeting);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to play voice sample.');
    } finally {
      setPlayingSample(false);
    }
  };

  const handleRepeat = async () => {
    if (!sessionManagerRef.current) return;
    try {
      await sessionManagerRef.current.repeatLastSpoken();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Repeat failed');
    }
  };

  const handleSlower = async () => {
    if (!sessionManagerRef.current) return;
    try {
      const newSpeed = Math.max(0.6, Number((speed - 0.15).toFixed(2)));
      setSpeed(newSpeed);
      chrome.storage.local.set({ formpilot_voice_speed: newSpeed });
      await sessionManagerRef.current.slowerPlease();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Slower playback failed');
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-3 space-y-3">
      {/* Voice Assistant Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${
              voiceEnabled
                ? 'bg-cyan-500 text-white shadow-xs'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            <Mic className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-800">Voice Assistant</h4>
            <p className="text-[10px] text-slate-500">Conversational Form Pilot</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleToggleVoice}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
            voiceEnabled ? 'bg-cyan-600' : 'bg-slate-300'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
              voiceEnabled ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* When disabled */}
      {!voiceEnabled && (
        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600 space-y-1">
          <p className="font-semibold text-slate-700">Patient human helper in your language</p>
          <p className="text-slate-500">
            Talk naturally in Hindi, Marathi, or English. Turn on above to enable voice controls.
          </p>
        </div>
      )}

      {/* When enabled */}
      {voiceEnabled && (
        <div className="space-y-3 pt-1 border-t border-slate-100">
          {/* Voice Engine Mode Selector: Free Browser Voice vs ElevenLabs */}
          <div className="flex items-center justify-between bg-slate-100 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setVoiceEngine('browser');
                chrome.storage.local.set({ formpilot_voice_engine: 'browser' });
                setErrorMessage('');
              }}
              className={`flex-1 py-1 px-2 rounded-md font-semibold text-[11px] transition cursor-pointer flex items-center justify-center space-x-1 ${
                voiceEngine === 'browser'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🟢 Free Browser Voice</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setVoiceEngine('elevenlabs');
                chrome.storage.local.set({ formpilot_voice_engine: 'elevenlabs' });
              }}
              className={`flex-1 py-1 px-2 rounded-md font-semibold text-[11px] transition cursor-pointer flex items-center justify-center space-x-1 ${
                voiceEngine === 'elevenlabs'
                  ? 'bg-white text-cyan-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>ElevenLabs Cloud</span>
            </button>
          </div>

          {/* ElevenLabs Key Warning or Inline Input (Only shown if user chose ElevenLabs Cloud and lacks a key) */}
          {voiceEngine === 'elevenlabs' && !activeApiKey && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs space-y-2">
              <div className="flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-xs">ElevenLabs API Key Required</p>
                  <p className="text-[11px] text-amber-700 leading-snug">
                    Paste your ElevenLabs key below, or click &ldquo;Free Browser Voice&rdquo; above to use voice with zero keys/cost:
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-1.5 pt-1">
                <input
                  type="password"
                  value={inlineKeyInput}
                  onChange={(e) => setInlineKeyInput(e.target.value)}
                  placeholder="Paste ElevenLabs key (xi-api-key)"
                  className="flex-1 px-2.5 py-1.5 text-xs border border-amber-300 rounded bg-white font-mono text-slate-800 focus:ring-2 focus:ring-cyan-500"
                />
                <button
                  type="button"
                  disabled={!inlineKeyInput.trim() || isSavingKey}
                  onClick={async () => {
                    const key = inlineKeyInput.trim();
                    if (!key) return;
                    setIsSavingKey(true);
                    await chrome.storage.local.set({ elevenLabsApiKey: key });
                    setActiveApiKey(key);
                    setIsSavingKey(false);
                    setInlineKeyInput('');
                  }}
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded text-xs font-semibold shrink-0 cursor-pointer transition"
                >
                  {isSavingKey ? 'Saving...' : 'Activate Key'}
                </button>
              </div>
              {onOpenSettings && (
                <div className="pt-0.5">
                  <button
                    onClick={onOpenSettings}
                    className="text-[10px] font-medium text-amber-800 underline hover:text-amber-950 cursor-pointer"
                  >
                    Or configure in Settings page &rarr;
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Status Badge */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {state === 'idle' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
                  <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-slate-400" />
                  Ready (Idle)
                </span>
              )}
              {state === 'listening' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 animate-pulse">
                  <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-blue-500" />
                  Listening...
                </span>
              )}
              {state === 'thinking' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">
                  <Activity className="w-3 h-3 mr-1 animate-spin text-amber-600" />
                  Thinking / Transcribing...
                </span>
              )}
              {state === 'speaking' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 animate-pulse">
                  <Volume2 className="w-3 h-3 mr-1 text-emerald-600" />
                  Speaking (Barge-in active)
                </span>
              )}
              {state === 'permission_needed' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">
                  <AlertCircle className="w-3 h-3 mr-1 text-red-600" />
                  Mic Permission Needed
                </span>
              )}
            </div>

            {/* Language Selector */}
            <div className="flex items-center space-x-1">
              <Globe className="w-3 h-3 text-slate-400" />
              <select
                value={language}
                onChange={(e) => {
                  setLanguage(e.target.value);
                  chrome.storage.local.set({ formpilot_voice_lang: e.target.value });
                }}
                className="text-[11px] font-semibold text-slate-700 border border-slate-200 rounded px-1.5 py-0.5 bg-slate-50"
              >
                {Object.values(SUPPORTED_LANGUAGES).map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.nativeName} ({l.name.split(' ')[0]})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Dedicated Microphone Permission Card for Chrome Side Panel */}
          {(state === 'permission_needed' || errorMessage.toLowerCase().includes('permission')) && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg space-y-2">
              <div className="flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900">
                  <span className="font-bold">Microphone Permission Needed in Chrome</span>
                  <p className="mt-0.5 text-[11px] text-amber-700 leading-snug">
                    Chrome blocks microphone popups inside Side Panels. Click below to open a tab and allow microphone access.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleOpenPermissionTab}
                className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center justify-center space-x-1.5 transition cursor-pointer"
              >
                <Mic className="w-3.5 h-3.5" />
                <span>Allow Microphone in Chrome</span>
              </button>
            </div>
          )}

          {/* Interactive Mic Action Row */}
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handlePushToTalk}
              disabled={voiceEngine === 'elevenlabs' && !activeApiKey}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 transition cursor-pointer shadow-xs ${
                state === 'listening'
                  ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
                  : 'bg-cyan-600 hover:bg-cyan-700 text-white'
              } ${voiceEngine === 'elevenlabs' && !activeApiKey ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {state === 'listening' ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Release / Click to Stop</span>
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5" />
                  <span>Push to Talk (Space)</span>
                </>
              )}
            </button>

            {/* Mute / Stop Button */}
            {(state === 'speaking' || state === 'listening') && (
              <button
                type="button"
                onClick={handleStopAll}
                className="p-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs transition cursor-pointer"
                title="Stop audio (Barge in)"
              >
                <VolumeX className="w-4 h-4 text-red-500" />
              </button>
            )}
          </div>

          {/* Mode toggle (Push-To-Talk vs Hands-Free VAD) */}
          <div className="flex items-center justify-between text-[11px] px-1 text-slate-600">
            <label className="flex items-center space-x-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isHandsFree}
                onChange={(e) => {
                  setIsHandsFree(e.target.checked);
                  chrome.storage.local.set({ formpilot_voice_hands_free: e.target.checked });
                }}
                className="rounded text-cyan-600 focus:ring-cyan-500 h-3.5 w-3.5"
              />
              <span>Hands-Free Mode (Voice Activity Detection)</span>
            </label>
            <span className="text-[10px] text-slate-400">Shortcut: Space / Alt+V</span>
          </div>

          {/* Live Transcript Display with Inline Correction */}
          {transcript && (
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
              <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold uppercase">
                <span>User Transcript</span>
                {transcriptConfidence > 0 && (
                  <span className={transcriptConfidence < 0.75 ? 'text-amber-600 font-bold' : 'text-emerald-600'}>
                    Conf: {(transcriptConfidence * 100).toFixed(0)}%
                    {transcriptConfidence < 0.75 && ' (Needs Review)'}
                  </span>
                )}
              </div>

              {isEditingTranscript ? (
                <div className="flex items-center space-x-1.5 pt-1">
                  <input
                    type="text"
                    value={editableTranscript}
                    onChange={(e) => setEditableTranscript(e.target.value)}
                    className="flex-1 px-2 py-1 text-xs border border-cyan-400 rounded bg-white"
                  />
                  <button
                    onClick={() => {
                      setTranscript(editableTranscript);
                      setIsEditingTranscript(false);
                    }}
                    className="p-1 bg-cyan-600 text-white rounded text-xs"
                    title="Confirm Edit"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <p className="text-xs text-slate-800 font-medium leading-snug">{transcript}</p>
                  <button
                    onClick={() => setIsEditingTranscript(true)}
                    className="text-slate-400 hover:text-slate-600 ml-2 p-0.5"
                    title="Correct Transcript"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Assistant Captions & Audio Controls */}
          {spokenText && (
            <div className="p-2.5 bg-cyan-50/70 border border-cyan-200 rounded-lg space-y-2">
              <div className="flex items-center justify-between text-[10px] text-cyan-800 font-semibold uppercase">
                <span className="flex items-center space-x-1">
                  <Volume2 className="w-3 h-3 text-cyan-600" />
                  <span>Assistant Spoken Response</span>
                </span>
                <div className="flex items-center space-x-1">
                  <button
                    type="button"
                    onClick={handleRepeat}
                    className="px-1.5 py-0.5 rounded bg-white border border-cyan-200 text-cyan-700 hover:bg-cyan-100 text-[10px] font-medium cursor-pointer"
                    title="Repeat response"
                  >
                    Repeat That
                  </button>
                  <button
                    type="button"
                    onClick={handleSlower}
                    className="px-1.5 py-0.5 rounded bg-white border border-cyan-200 text-cyan-700 hover:bg-cyan-100 text-[10px] font-medium cursor-pointer"
                    title="Speak slower"
                  >
                    Slower ({speed.toFixed(2)}x)
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-800 leading-snug" aria-live="polite">
                &ldquo;{spokenText}&rdquo;
              </p>
            </div>
          )}

          {/* Audio Verification & Echo Test Checkpoints */}
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-1.5">
            <button
              type="button"
              onClick={handlePlaySample}
              disabled={playingSample || (voiceEngine === 'elevenlabs' && !activeApiKey) || state === 'speaking'}
              className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md px-2 py-1 flex items-center space-x-1 transition cursor-pointer disabled:opacity-50"
              title="Test speaker output by speaking a greeting in the selected language"
            >
              <Volume2 className={`w-3 h-3 ${playingSample ? 'animate-bounce' : ''}`} />
              <span>{playingSample ? 'Speaking...' : '🔊 Hear Voice Sample'}</span>
            </button>

            <button
              type="button"
              onClick={handleRunEchoTest}
              disabled={runningEchoTest || (voiceEngine === 'elevenlabs' && !activeApiKey)}
              className="text-[11px] font-semibold text-cyan-700 hover:text-cyan-800 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 rounded-md px-2 py-1 flex items-center space-x-1 transition cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className={`w-3 h-3 ${runningEchoTest ? 'animate-spin' : ''}`} />
              <span>{runningEchoTest ? 'Testing Voice (Say something!)...' : 'Run Echo Test'}</span>
            </button>

            {echoResult && (
              <span
                className={`w-full text-[10px] font-semibold text-right ${
                  echoResult.success ? 'text-emerald-700' : 'text-red-600'
                }`}
              >
                {echoResult.success
                  ? `✓ Echo OK: "${echoResult.transcription}" (${echoResult.latencyMs}ms)`
                  : `✕ ${echoResult.error || 'Failed'}`}
              </span>
            )}
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-red-800 text-[11px] flex items-start space-x-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>
      )}

      {/* Voice Consent Modal */}
      <VoiceConsentModal
        isOpen={showConsentModal}
        onConfirm={handleConsentConfirm}
        onCancel={() => setShowConsentModal(false)}
      />
    </div>
  );
};

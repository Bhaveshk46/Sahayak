import React, { useState } from 'react';
import { Mic, ShieldAlert, CheckCircle2, X } from 'lucide-react';

interface VoiceConsentModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const VoiceConsentModal: React.FC<VoiceConsentModalProps> = ({
  isOpen,
  onConfirm,
  onCancel,
}) => {
  const [acknowledged, setAcknowledged] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4 border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2 text-cyan-700 font-bold text-sm">
            <Mic className="w-5 h-5 shrink-0" />
            <span>Enable Conversational Voice Assistant</span>
          </div>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Required Mandatory Consent Disclosure */}
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg space-y-2 text-amber-900 text-xs">
          <div className="flex items-start space-x-2 font-semibold">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>Voice Privacy & Data Transmission Notice:</span>
          </div>
          <p className="leading-relaxed font-medium">
            &ldquo;Your voice and the words you say go to ElevenLabs (speech recognition and voice) and Google Gemini (the assistant). Do not say Aadhaar, PAN, bank account numbers, OTPs or passwords.&rdquo;
          </p>
        </div>

        <div className="space-y-2 text-xs text-slate-600">
          <p className="font-semibold text-slate-800">FormPilot Voice Privacy Protections:</p>
          <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-600">
            <li>Audio recordings are streamed ephemerally and never stored on disk.</li>
            <li>Voice transcripts are never persisted or shared for training.</li>
            <li>Sensitive national IDs (Aadhaar, PAN, Bank IFSC/Accounts, Passwords) are strictly rejected by voice.</li>
            <li>You can disable voice mode or revoke permissions at any time.</li>
          </ul>
        </div>

        <div className="pt-2 border-t border-slate-100 space-y-3">
          <label className="flex items-start space-x-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 rounded text-cyan-600 focus:ring-cyan-500 h-4 w-4"
            />
            <span className="text-xs text-slate-700 font-medium leading-snug">
              I understand that my spoken voice will be processed by ElevenLabs and Google Gemini, and I agree not to speak sensitive IDs or passwords.
            </span>
          </label>

          <div className="flex justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!acknowledged}
              onClick={onConfirm}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold text-white flex items-center space-x-1.5 transition ${
                acknowledged
                  ? 'bg-cyan-600 hover:bg-cyan-700 shadow-xs cursor-pointer'
                  : 'bg-slate-300 cursor-not-allowed'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Enable Voice Assistant</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

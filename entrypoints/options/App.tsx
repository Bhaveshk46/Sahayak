import React, { useState, useEffect } from 'react';
import {
  Shield,
  CheckCircle2,
  Save,
  Sparkles,
  AlertCircle,
  Trash2,
  Globe,
  Database,
  Eye,
  AlertTriangle,
  KeyRound,
  RefreshCw,
  Lock,
  FileCode2,
} from 'lucide-react';
import { ApiConfig } from '../../src/types';
import { clearMappingCache, db } from '../../src/storage/db';

export default function OptionsApp() {
  const [activeTab, setActiveTab] = useState<'settings' | 'privacy'>('settings');
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [sarvamConfigured, setSarvamConfigured] = useState(false);
  const [provider, setProvider] = useState<'gemini' | 'claude'>('gemini');
  const [geminiModel, setGeminiModel] = useState('gemini-2.5-flash');
  const [language, setLanguage] = useState('en');
  const [saved, setSaved] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // Cache & data deletion
  const [cacheCleared, setCacheCleared] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [dataDeleted, setDataDeleted] = useState(false);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_API_CONFIG' }, (response) => {
      if (response?.success && response.payload) {
        const config: ApiConfig = response.payload;
        setProvider(config.provider || 'gemini');
        setGeminiConfigured(Boolean(config.geminiApiKey && config.geminiApiKey.trim().length > 0));
        setSarvamConfigured(Boolean(config.sarvamApiKey && config.sarvamApiKey.trim().length > 0));
        setGeminiModel(config.geminiModel || 'gemini-2.5-flash');
      }
    });

    chrome.storage.local.get(['formpilot_language'], (res) => {
      if (res?.formpilot_language) setLanguage(res.formpilot_language);
    });
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Partial<ApiConfig> = {
      provider,
      geminiModel,
    };

    chrome.runtime.sendMessage({ type: 'SET_API_CONFIG', payload }, (response) => {
      if (response?.success) {
        chrome.storage.local.set({
          formpilot_language: language,
        }, () => {
          setSaved(true);
          setStatusMessage('Settings saved.');
          setTimeout(() => setSaved(false), 3000);
        });
      } else {
        setStatusMessage('Failed to save settings: ' + (response?.error || 'Unknown error'));
      }
    });
  };

  const handleClearCache = async () => {
    try {
      await clearMappingCache();
      setCacheCleared(true);
      setTimeout(() => setCacheCleared(false), 3000);
    } catch (e) {
      alert('Failed to clear cache: ' + String(e));
    }
  };

  const handleDeleteAllData = async () => {
    if (deleteConfirmationInput !== 'DELETE') return;
    setIsDeleting(true);

    try {
      await db.documents.clear();
      await db.profile.clear();
      await db.mappingCache.clear();
      await db.settings.clear();

      await chrome.storage.local.clear();
      if (chrome.storage?.session) {
        await chrome.storage.session.clear();
      }

      chrome.runtime.sendMessage({ type: 'LOCK_STORAGE' }).catch(() => {});

      setIsDeleting(false);
      setShowDeleteModal(false);
      setDataDeleted(true);
      setDeleteConfirmationInput('');
      setTimeout(() => setDataDeleted(false), 4000);
    } catch (err) {
      setIsDeleting(false);
      alert('Error deleting data: ' + String(err));
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4 flex justify-center font-sans text-slate-800">
      <div className="max-w-2xl w-full bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden flex flex-col">
        {/* Top Header */}
        <div className="bg-slate-900 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <img src="/icon-48.png" alt="Sahayak Logo" className="w-9 h-9 rounded-lg shadow-xs object-cover border border-amber-400/30" />
            <div>
              <h1 className="text-base font-bold tracking-tight">Sahayak Preferences</h1>
              <p className="text-xs text-slate-400">Autonomous Form Agent Settings & Privacy Governance</p>
            </div>
          </div>
          <div className="flex items-center space-x-1.5 text-xs bg-slate-800 px-2.5 py-1 rounded-full text-slate-300 font-mono border border-slate-700">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>On-Device Security</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 text-xs font-semibold px-4 pt-2">
          <button
            onClick={() => setActiveTab('settings')}
            className={`pb-2.5 px-3 border-b-2 transition flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'settings'
                ? 'border-indigo-600 text-indigo-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Agent & Environment Configuration</span>
          </button>
          <button
            onClick={() => setActiveTab('privacy')}
            className={`pb-2.5 px-3 border-b-2 transition flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'privacy'
                ? 'border-indigo-600 text-indigo-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Privacy & Security Audit</span>
          </button>
        </div>

        {/* TAB 1: SETTINGS */}
        {activeTab === 'settings' && (
          <form onSubmit={handleSave} className="p-6 space-y-6 flex-1">
            {/* Environment Security Card */}
            <div className="p-4 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-3">
              <div className="flex items-center space-x-2 text-indigo-950 font-bold text-xs uppercase tracking-wide">
                <FileCode2 className="w-4 h-4 text-indigo-600" />
                <span>Environment-Based Configuration (.env)</span>
              </div>
              <p className="text-xs text-indigo-900 leading-relaxed">
                API keys are securely loaded from your project root <code className="px-1.5 py-0.5 bg-white border border-indigo-200 rounded text-indigo-700 font-mono text-[11px]">.env</code> file. Manual key entry in the browser extension UI is disabled for enhanced security and zero-setup operation.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                {/* Google Gemini Card */}
                <div className="p-3 bg-white border border-indigo-100 rounded-lg shadow-2xs space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 flex items-center space-x-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Google Gemini</span>
                    </span>
                    {geminiConfigured ? (
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-semibold rounded-full flex items-center space-x-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Configured</span>
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-semibold rounded-full flex items-center space-x-1">
                        <AlertCircle className="w-3 h-3" />
                        <span>Not Set</span>
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono">
                    GEMINI_API_KEY
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Powers fallback AI field matching for ambiguous forms.
                  </p>
                </div>

                {/* Sarvam AI Card */}
                <div className="p-3 bg-white border border-indigo-100 rounded-lg shadow-2xs space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 flex items-center space-x-1.5">
                      <Database className="w-3.5 h-3.5 text-purple-600" />
                      <span>Sarvam AI</span>
                    </span>
                    {sarvamConfigured ? (
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-semibold rounded-full flex items-center space-x-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Configured</span>
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-semibold rounded-full">
                        Optional
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono">
                    SARVAM_API_KEY
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Indian statutory document OCR (Aadhaar, PAN). Offline regex runs if omitted.
                  </p>
                </div>
              </div>
            </div>

            {/* Model Selection */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                Decision LLM Model
              </label>
              <select
                value={geminiModel}
                onChange={(e) => setGeminiModel(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-md border border-slate-300 bg-white text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500"
              >
                <option value="gemini-2.5-flash">gemini-2.5-flash (Recommended: Low latency & high accuracy)</option>
                <option value="gemini-2.5-pro">gemini-2.5-pro (Extended reasoning)</option>
                <option value="gemini-1.5-flash">gemini-1.5-flash</option>
              </select>
              <p className="text-[11px] text-slate-500">
                Used only when local rule heuristics return ambiguous matching confidence (&lt; 0.85).
              </p>
            </div>

            {/* Language Preference */}
            <div className="space-y-1.5 pt-2 border-t border-slate-200">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center space-x-1.5">
                <Globe className="w-3.5 h-3.5 text-indigo-600" />
                <span>Preferred Portal Language / Regional Heuristics</span>
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-md border border-slate-300 bg-white text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500"
              >
                <option value="en">English (Default)</option>
                <option value="hi">Hindi (हिंदी - आधार, पैन, छात्रवृत्ति)</option>
                <option value="mr">Marathi (मराठी - जात प्रमाणपत्र, उत्पन्न)</option>
                <option value="gu">Gujarati (ગુજરાતી)</option>
                <option value="bn">Bengali (বাংলা)</option>
                <option value="ta">Tamil (தமிழ்)</option>
                <option value="te">Telugu (తెలుగు)</option>
              </select>
            </div>

            {/* Cache Management */}
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-700">Form Mapping Cache</h4>
                <p className="text-[11px] text-slate-500">
                  Cached form signatures and learned field mappings in local IndexedDB.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClearCache}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md text-xs font-semibold text-slate-700 flex items-center space-x-1.5 transition cursor-pointer"
              >
                <RefreshCw className="w-3 h-3 text-slate-500" />
                <span>{cacheCleared ? 'Cleared!' : 'Clear Cache'}</span>
              </button>
            </div>

            {/* Danger Zone: Delete All Data */}
            <div className="pt-4 border-t border-red-200 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-red-700 flex items-center space-x-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                    <span>Danger Zone: Erase All Data</span>
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Permanently deletes all encrypted documents, profile credentials, settings, and caches.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(true)}
                  className="px-3 py-1.5 bg-red-50 hover:bg-red-100 border border-red-300 text-red-700 rounded-md text-xs font-bold transition cursor-pointer flex items-center space-x-1"
                >
                  <Trash2 className="w-3 h-3 text-red-600" />
                  <span>Delete All Data</span>
                </button>
              </div>

              {dataDeleted && (
                <div className="p-2 bg-emerald-50 border border-emerald-200 rounded text-emerald-800 text-xs font-semibold">
                  ✓ All FormPilot data, vault records, and credentials have been permanently wiped.
                </div>
              )}
            </div>

            {/* Save Button */}
            <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
              <div>
                {saved && (
                  <span className="flex items-center space-x-1.5 text-xs text-emerald-600 font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Settings Saved!</span>
                  </span>
                )}
                {statusMessage && !saved && (
                  <span className="text-xs text-slate-500">{statusMessage}</span>
                )}
              </div>

              <button
                type="submit"
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs flex items-center space-x-2 transition cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Configuration</span>
              </button>
            </div>
          </form>
        )}

        {/* TAB 2: PRIVACY & SECURITY AUDIT */}
        {activeTab === 'privacy' && (
          <div className="p-6 space-y-6 flex-1 text-xs">
            {/* Zero Leakage Banner */}
            <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl space-y-2">
              <div className="flex items-center space-x-2 text-emerald-900 font-bold text-sm">
                <Shield className="w-5 h-5 text-emerald-600" />
                <span>Rule 1 & Rule 8 Certified: Zero Data Leakage Guarantee</span>
              </div>
              <p className="text-emerald-800 text-xs leading-relaxed">
                FormPilot is architected so that your sensitive personal profile values (names, Aadhaar numbers, phone numbers, birth dates, financial information) <strong>never leave your device</strong>.
              </p>
            </div>

            {/* Privacy Breakdown Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                <div className="font-bold text-slate-800 flex items-center space-x-1.5 text-xs">
                  <KeyRound className="w-4 h-4 text-indigo-600" />
                  <span>On-Device Vault Encryption</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-snug">
                  All documents and extracted profile entries are encrypted with <strong>AES-GCM (256-bit)</strong> using a key derived via <strong>PBKDF2 with 200,000 iterations</strong> and a unique salt. The master passphrase is never stored on disk.
                </p>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                <div className="font-bold text-slate-800 flex items-center space-x-1.5 text-xs">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <span>Field Matching (M5)</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-snug">
                  Local fuzzy heuristics (fuse.js) match high-confidence fields first without an LLM. Only ambiguous fields under 0.85 confidence query the LLM with <strong>field labels and profile key names only</strong>; personal values are never sent.
                </p>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                <div className="font-bold text-slate-800 flex items-center space-x-1.5 text-xs">
                  <Database className="w-4 h-4 text-emerald-600" />
                  <span>Autofill Execution (M3)</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-snug">
                  Autofill values are retrieved from the decrypted vault memory and inserted into the active page using synthetic DOM events and native property descriptors. Zero network communication is made during fill.
                </p>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                <div className="font-bold text-slate-800 flex items-center space-x-1.5 text-xs">
                  <Lock className="w-4 h-4 text-amber-600" />
                  <span>Rule 2 Guardrails</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-snug">
                  FormPilot is hardcoded never to click final &ldquo;Submit&rdquo; buttons and never to automate CAPTCHA or OTP challenges, ensuring mandatory human verification before statutory commitment.
                </p>
              </div>
            </div>

            {/* Network Outbound Audit Table */}
            <div className="space-y-2">
              <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wide">
                Network Outbound Transmission Audit
              </h3>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">Destination</th>
                      <th className="p-2.5">Payload Transmitted</th>
                      <th className="p-2.5">User Trigger</th>
                      <th className="p-2.5">Privacy Safeguard</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-600">
                    <tr>
                      <td className="p-2.5 font-mono text-indigo-700 font-medium">Google Gemini</td>
                      <td className="p-2.5">Form field labels, types, options, list of profile key names</td>
                      <td className="p-2.5">User clicks &ldquo;Decide&rdquo; (only for ambiguous fields &lt;0.85)</td>
                      <td className="p-2.5 text-emerald-700 font-medium">Zero profile values; verified by unit tests</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-mono text-purple-700 font-medium">Sarvam AI Document AI</td>
                      <td className="p-2.5">Document image / PDF bytes</td>
                      <td className="p-2.5">User explicitly clicks &ldquo;Extract from Document&rdquo;</td>
                      <td className="p-2.5">User consent modal required; .env configured key only</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-mono text-slate-700 font-medium">Active Webpage (Local Tab)</td>
                      <td className="p-2.5">Decrypted form values & File objects</td>
                      <td className="p-2.5">User approves fill plan or attaches file</td>
                      <td className="p-2.5">100% on-device DOM injection; no telemetry</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-5 space-y-4 border border-red-200">
              <div className="flex items-center space-x-2 text-red-600 font-bold text-sm">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span>Confirm Complete Data Deletion</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                This action is irreversible. All your stored documents, extracted credentials, encryption salts, and cached mappings will be permanently destroyed.
              </p>
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold text-slate-700">
                  Type <span className="font-mono text-red-600 font-bold">DELETE</span> to confirm:
                </label>
                <input
                  type="text"
                  value={deleteConfirmationInput}
                  onChange={(e) => setDeleteConfirmationInput(e.target.value)}
                  placeholder="DELETE"
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md font-mono focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setDeleteConfirmationInput('');
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-md text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAllData}
                  disabled={deleteConfirmationInput !== 'DELETE' || isDeleting}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-bold disabled:opacity-40 transition"
                >
                  {isDeleting ? 'Deleting...' : 'Erase Everything'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

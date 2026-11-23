import { useEffect, useState, useCallback, useMemo } from 'react';
import { 
  Bot, 
  Eye, 
  Play, 
  AlertCircle, 
  RefreshCw, 
  ShieldCheck, 
  Settings, 
  FileText, 
  Lock, 
  Layers,
  Sparkles,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Paperclip,
  Clock
} from 'lucide-react';
import { FormSchema, FormField, AgentStep, ExtensionMessage } from '../../src/types';
import { mapFieldToRealProfile } from '../../src/fillers/profileMapper';
import { DocumentsAndProfileView } from './DocumentsAndProfileView';
import { DecideView } from './DecideView';
import { DecisionPlanItem } from '../../src/decide/decisionEngine';
import { isStorageUnlocked, getAllDecryptedProfileRecords } from '../../src/storage/db';
import { ProfileRecord } from '../../src/types/profile';
import { UndoRecord } from '../../src/fillers/formFiller';
import { TimelineDrawer } from '../../src/timeline/TimelineDrawer';

export default function App() {
  const [activeStep, setActiveStep] = useState<AgentStep>('DECIDED');
  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('Ready to scan');
  const [activeTabInfo, setActiveTabInfo] = useState<{ id?: number; url?: string; title?: string }>({});
  const [undoHistory, setUndoHistory] = useState<UndoRecord[]>([]);
  const [fillFeedback, setFillFeedback] = useState<Record<string, { ok: boolean; reason?: string }>>({});
  const [profileRecords, setProfileRecords] = useState<ProfileRecord[]>([]);
  const [isVaultUnlocked, setIsVaultUnlocked] = useState<boolean>(isStorageUnlocked());
  const [approvedPlan, setApprovedPlan] = useState<DecisionPlanItem[] | null>(null);
  const [quickAttachVisible, setQuickAttachVisible] = useState<boolean>(true);
  const [showTimeline, setShowTimeline] = useState<boolean>(false);
  const [guidedFallbackAlert, setGuidedFallbackAlert] = useState<{
    slotLabel: string;
    documentId: string;
    documentName: string;
    documentType: string;
  } | null>(null);

  const reloadProfile = useCallback(async () => {
    const unlocked = isStorageUnlocked();
    setIsVaultUnlocked(unlocked);
    if (unlocked) {
      try {
        const records = await getAllDecryptedProfileRecords();
        setProfileRecords(records);
      } catch (e) {
        console.warn('Failed to load decrypted profile records', e);
      }
    } else {
      setProfileRecords([]);
    }
  }, []);

  useEffect(() => {
    reloadProfile();
  }, [reloadProfile]);

  const getActiveTab = useCallback(async (): Promise<chrome.tabs.Tab | undefined> => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab?.id) return tab;
      const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return currentTab;
    } catch {
      return undefined;
    }
  }, []);

  const toggleQuickAttach = useCallback(async () => {
    const next = !quickAttachVisible;
    setQuickAttachVisible(next);
    const tab = await getActiveTab();
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'TOGGLE_QUICK_ATTACH',
        payload: { visible: next },
      } as ExtensionMessage);
    }
  }, [quickAttachVisible, getActiveTab]);

  const triggerScanOnActiveTab = useCallback(async () => {
    setLoading(true);
    setStatusMessage('Scanning active tab across all frames & iframes...');

    const tab = await getActiveTab();
    if (!tab?.id) {
      setLoading(false);
      setStatusMessage('No active browser tab found.');
      return;
    }

    setActiveTabInfo({ id: tab.id, url: tab.url, title: tab.title });

    chrome.runtime.sendMessage(
      { type: 'TRIGGER_SCAN_ALL_FRAMES', payload: { tabId: tab.id } } as ExtensionMessage,
      (resp) => {
        if (chrome.runtime.lastError || !resp?.success) {
          setStatusMessage('Injecting agent script into page & frames...');
          chrome.runtime.sendMessage(
            { type: 'INJECT_AND_SCAN', payload: { tabId: tab.id! } } as ExtensionMessage,
            (bgResp) => {
              setLoading(false);
              if (bgResp?.success && bgResp.schema) {
                setSchema(bgResp.schema);
                const iframeCount = bgResp.schema.fields.filter((f: FormField) => f.isInsideIframe).length;
                setStatusMessage(
                  iframeCount > 0
                    ? `Observed ${bgResp.schema.fields.length} fields (${iframeCount} in iframe)`
                    : `Observed ${bgResp.schema.fields.length} form fields`
                );
              } else {
                setStatusMessage('No active form detected on page.');
              }
            }
          );
        } else {
          setLoading(false);
          if (resp.schema) {
            setSchema(resp.schema);
            const iframeCount = resp.schema.fields.filter((f: FormField) => f.isInsideIframe).length;
            setStatusMessage(
              iframeCount > 0
                ? `Observed ${resp.schema.fields.length} fields (${iframeCount} in iframe)`
                : `Observed ${resp.schema.fields.length} form fields`
            );
          }
        }
      }
    );
  }, [getActiveTab]);

  useEffect(() => {
    triggerScanOnActiveTab();

    const tabActivatedListener = () => triggerScanOnActiveTab();
    chrome.tabs.onActivated.addListener(tabActivatedListener);

    const tabUpdatedListener = (_tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (changeInfo.status === 'complete') triggerScanOnActiveTab();
    };
    chrome.tabs.onUpdated.addListener(tabUpdatedListener);

    const messageListener = (message: ExtensionMessage) => {
      if (message.type === 'FORM_SCHEMA_OBSERVED') {
        setSchema(message.payload);
        const iframeCount = message.payload.fields.filter((f: FormField) => f.isInsideIframe).length;
        setStatusMessage(
          iframeCount > 0
            ? `Observed ${message.payload.fields.length} fields (${iframeCount} in iframe)`
            : `Observed ${message.payload.fields.length} form fields`
        );
        setLoading(false);
      } else if (message.type === 'GUIDED_FALLBACK_TRIGGERED') {
        setGuidedFallbackAlert(message.payload);
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);

    return () => {
      chrome.tabs.onActivated.removeListener(tabActivatedListener);
      chrome.tabs.onUpdated.removeListener(tabUpdatedListener);
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [triggerScanOnActiveTab]);

  // Map each schema field to prospective fill value from either approved decision plan or decrypted real profile
  const fieldFillPlan = useMemo(() => {
    if (!schema) return [];

    const approvedMap = new Map<string, DecisionPlanItem>();
    if (approvedPlan) {
      for (const item of approvedPlan) {
        approvedMap.set(item.field.id, item);
      }
    }

    return schema.fields.map((field) => {
      const isCaptcha =
        field.name.toLowerCase().includes('captcha') || field.id.toLowerCase().includes('captcha');
      const isFile = field.type === 'file' || field.type === 'dropzone';

      const approved = approvedMap.get(field.id);
      let targetValue = '';
      let profileKey: string | undefined = undefined;
      let status: 'ready' | 'needs-you' | 'skipped' = 'ready';
      let reason = '';

      if (approved) {
        targetValue = approved.targetValue;
        profileKey = approved.profileKey || undefined;

        if (isCaptcha) {
          status = 'skipped';
          reason = 'Rule 2: CAPTCHA / OTP preserved for user';
        } else if (isFile) {
          status = 'skipped';
          reason = 'Document slots managed via Quick-Attach (M6)';
        } else if (!profileKey) {
          status = 'needs-you';
          reason = 'Skipped or unmapped in Decision Engine';
        } else if (!targetValue) {
          status = 'needs-you';
          reason = !isVaultUnlocked
            ? 'Vault locked. Unlock in Profile tab'
            : `Profile has no value stored for key "${profileKey}"`;
        } else if (approved.status === 'needs-review') {
          status = 'needs-you';
          reason = approved.reason || 'Requires user confirmation (<75% confidence)';
        }
      } else {
        const mapping = mapFieldToRealProfile(field, profileRecords);
        targetValue = mapping.value || '';
        profileKey = mapping.profileKey;

        if (isCaptcha) {
          status = 'skipped';
          reason = 'Rule 2: CAPTCHA / OTP preserved for user';
        } else if (isFile) {
          status = 'skipped';
          reason = 'Document slots managed via Quick-Attach (M6)';
        } else if (mapping.unconfirmed) {
          status = 'needs-you';
          reason = mapping.reason || 'Value requires user confirmation in Profile tab';
        } else if (!mapping.value) {
          status = 'needs-you';
          reason = !isVaultUnlocked
            ? 'Profile vault locked. Unlock in Profile tab'
            : 'No profile match found for this field';
        }
      }

      // Check if fill previously failed
      const feedback = fillFeedback[field.id];
      if (feedback && !feedback.ok) {
        status = 'needs-you';
        reason = feedback.reason || 'Element unresolved on page';
      }

      return {
        field,
        targetValue,
        profileKey,
        currentValue: field.currentValue || '',
        status,
        reason,
      };
    });
  }, [schema, fillFeedback, profileRecords, isVaultUnlocked, approvedPlan]);

  const previewField = async (field: FormField) => {
    const tab = await getActiveTab();
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, {
      type: 'HIGHLIGHT_FIELD',
      payload: { field, status: 'preview' },
    } as ExtensionMessage);
  };

  const applySingleFill = async (field: FormField, value: string) => {
    const tab = await getActiveTab();
    if (!tab?.id) return;

    setLoading(true);
    chrome.runtime.sendMessage(
      {
        type: 'FILL_FIELDS',
        payload: { items: [{ field, value }], tabId: tab.id },
      } as ExtensionMessage,
      (resp) => {
        setLoading(false);
        if (resp?.success && resp.results?.length) {
          const res = resp.results[0];
          setFillFeedback((prev) => ({ ...prev, [field.id]: res }));
          if (resp.undoRecords?.length) {
            setUndoHistory((prev) => [...prev, ...resp.undoRecords]);
          }
        }
      }
    );
  };

  const applyAllFills = async () => {
    const tab = await getActiveTab();
    if (!tab?.id) return;

    const itemsToFill = fieldFillPlan
      .filter((item) => item.status === 'ready' && item.targetValue)
      .map((item) => ({ field: item.field, value: item.targetValue }));

    if (itemsToFill.length === 0) {
      alert('No automatable fields ready to fill.');
      return;
    }

    setLoading(true);
    setStatusMessage(`Filling ${itemsToFill.length} fields with native setters...`);

    chrome.runtime.sendMessage(
      {
        type: 'FILL_FIELDS',
        payload: { items: itemsToFill, tabId: tab.id },
      } as ExtensionMessage,
      (resp) => {
        setLoading(false);
        if (resp?.success && resp.results) {
          const feedbackMap: Record<string, { ok: boolean; reason?: string }> = {};
          resp.results.forEach((r: any) => {
            feedbackMap[r.fieldId] = r;
          });
          setFillFeedback(feedbackMap);
          if (resp.undoRecords) {
            setUndoHistory((prev) => [...prev, ...resp.undoRecords]);
          }
          setStatusMessage(`Filled ${resp.results.filter((r: any) => r.ok).length} fields successfully!`);
        }
      }
    );
  };

  const undoAllFills = async () => {
    if (undoHistory.length === 0) return;
    const tab = await getActiveTab();
    if (!tab?.id) return;

    setLoading(true);
    setStatusMessage(`Undoing ${undoHistory.length} fields...`);

    chrome.runtime.sendMessage(
      {
        type: 'UNDO_FILLS',
        payload: { records: [...undoHistory].reverse(), tabId: tab.id },
      } as ExtensionMessage,
      (resp) => {
        setLoading(false);
        if (resp?.success) {
          setUndoHistory([]);
          setFillFeedback({});
          setStatusMessage(`Undid ${resp.undoneCount} field values.`);
        }
      }
    );
  };

  const undoSingleFill = async (fieldId: string) => {
    const recordIndex = undoHistory.findIndex((u) => u.fieldId === fieldId);
    if (recordIndex === -1) return;
    const record = undoHistory[recordIndex];

    const tab = await getActiveTab();
    if (!tab?.id) return;

    setLoading(true);
    chrome.runtime.sendMessage(
      {
        type: 'UNDO_FILLS',
        payload: { records: [record], tabId: tab.id },
      } as ExtensionMessage,
      (resp) => {
        setLoading(false);
        if (resp?.success) {
          setUndoHistory((prev) => prev.filter((_, idx) => idx !== recordIndex));
          setFillFeedback((prev) => {
            const next = { ...prev };
            delete next[fieldId];
            return next;
          });
          setStatusMessage('Restored previous value for field.');
        }
      }
    );
  };

  const openOptions = () => chrome.runtime.openOptionsPage();
  const iframeFieldCount = schema?.fields.filter((f: FormField) => f.isInsideIframe).length || 0;
  const readyToFillCount = fieldFillPlan.filter((p) => p.status === 'ready').length;
  const needsYouCount = fieldFillPlan.filter((p) => p.status === 'needs-you').length;

  return (
    <div className="flex flex-col h-screen text-xs bg-slate-50 select-none">
      {/* Header */}
      <header className="px-3 py-2 bg-white border-b border-slate-200 flex items-center justify-between shadow-2xs">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold shadow-2xs">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h1 className="font-semibold text-sm text-slate-900 leading-tight">FormPilot</h1>
            <p className="text-[10px] text-slate-500 font-mono">Agent Loop: OBSERVE → ACT</p>
          </div>
        </div>

        <div className="flex items-center space-x-1">
          <button
            onClick={() => setShowTimeline(true)}
            title="Open Agent Reasoning Timeline (M8)"
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 transition cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5 text-indigo-600" />
          </button>
          <button
            onClick={toggleQuickAttach}
            title={`Quick-Attach Boxes: ${quickAttachVisible ? 'Visible (Click to hide)' : 'Hidden (Click to show)'}`}
            className={`p-1.5 rounded-md transition cursor-pointer ${
              quickAttachVisible ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' : 'hover:bg-slate-100 text-slate-400'
            }`}
          >
            <Paperclip className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => triggerScanOnActiveTab()}
            disabled={loading}
            title="Rescan Page & Iframes"
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 disabled:opacity-50 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
          </button>
          <button
            onClick={openOptions}
            title="Options & API Keys (BYOK)"
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 transition cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Agent Loop Status Tabs */}
      <div className="grid grid-cols-4 bg-slate-100 p-1 border-b border-slate-200 text-center gap-1 font-medium">
        <button
          onClick={() => setActiveStep('OBSERVED')}
          className={`py-1.5 px-1 rounded flex items-center justify-center space-x-1 transition cursor-pointer ${
            activeStep === 'OBSERVED' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Eye className="w-3 h-3" />
          <span className="text-[10px] uppercase tracking-wider">Observe</span>
        </button>

        <button
          onClick={() => {
            setActiveStep('DECIDED');
            reloadProfile();
          }}
          className={`py-1.5 px-1 rounded flex items-center justify-center space-x-1 transition cursor-pointer ${
            activeStep === 'DECIDED' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Sparkles className="w-3 h-3" />
          <span className="text-[10px] uppercase tracking-wider">Decide</span>
        </button>

        <button
          onClick={() => setActiveStep('ACTED')}
          className={`py-1.5 px-1 rounded flex items-center justify-center space-x-1 transition cursor-pointer ${
            activeStep === 'ACTED' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Play className="w-3 h-3" />
          <span className="text-[10px] uppercase tracking-wider">Act</span>
          {readyToFillCount > 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
          )}
        </button>

        <button
          onClick={() => {
            setActiveStep('PROFILE');
            reloadProfile();
          }}
          className={`py-1.5 px-1 rounded flex items-center justify-center space-x-1 transition cursor-pointer ${
            activeStep === 'PROFILE' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <FileText className="w-3 h-3" />
          <span className="text-[10px] uppercase tracking-wider">Profile</span>
          {!isVaultUnlocked && (
            <Lock className="w-2.5 h-2.5 text-amber-500" />
          )}
        </button>
      </div>

      {/* Active Context Banner */}
      <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-[11px] text-slate-600">
        <div className="flex items-center space-x-1.5 truncate max-w-[200px]">
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
          <span className="truncate font-mono">{activeTabInfo.url || 'Active Tab'}</span>
        </div>
        <div className="flex items-center space-x-1 text-slate-500 font-mono text-[10px] font-semibold">
          <span>{schema ? `${schema.fields.length} fields` : '0 fields'}</span>
          {iframeFieldCount > 0 && (
            <span className="text-purple-600 bg-purple-50 px-1 rounded text-[9px]">
              ({iframeFieldCount} in iframe)
            </span>
          )}
        </div>
      </div>

      {/* Live Agent Status Line */}
      <div className="px-3 py-1 bg-indigo-50/70 border-b border-indigo-100 flex items-center justify-between text-[10px] text-indigo-700">
        <span className="truncate">{statusMessage}</span>
        {loading && <span className="font-mono text-indigo-500 animate-pulse">acting...</span>}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Guided Fallback Mode Banner (Requirement 4) */}
        {guidedFallbackAlert && (
          <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 flex items-start justify-between space-x-2">
            <div className="flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <h4 className="font-semibold text-xs text-amber-800">Guided Attachment Mode</h4>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  Slot &ldquo;<strong>{guidedFallbackAlert.slotLabel}</strong>&rdquo; is outlined in red on page. Please manually attach document &ldquo;<strong>{guidedFallbackAlert.documentName}</strong>&rdquo; ({guidedFallbackAlert.documentType}).
                </p>
              </div>
            </div>
            <button
              onClick={() => setGuidedFallbackAlert(null)}
              className="text-[10px] text-amber-800 hover:text-amber-950 font-bold px-1.5 py-0.5 bg-amber-100 rounded cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* CAPTCHA / Handback Guard Warning */}
        {schema?.hasCaptcha && (
          <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 flex items-start space-x-2">
            <Lock className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-[11px] leading-tight">
              <span className="font-semibold">CAPTCHA / Human Verification Guard Active.</span>
              <p className="mt-0.5 text-amber-700">
                Rule 2: FormPilot will safely stop before this step and hand back control for OTP / CAPTCHA and final submit.
              </p>
            </div>
          </div>
        )}

        {/* Tab View: ACT (Preview & Act) */}
        {activeStep === 'ACTED' && (
          <div className="space-y-3">
            {/* Vault status banner */}
            {!isVaultUnlocked ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 flex items-center justify-between text-xs shadow-2xs">
                <div className="flex items-center space-x-2">
                  <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                  <div>
                    <span className="font-semibold block text-[11px]">Secure Vault Locked</span>
                    <span className="text-[10px] text-amber-700">Unlock your profile to map and fill fields with your real data.</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setActiveStep('PROFILE');
                    reloadProfile();
                  }}
                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-semibold text-[10px] shrink-0 transition cursor-pointer"
                >
                  Unlock Vault
                </button>
              </div>
            ) : profileRecords.length === 0 ? (
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-900 flex items-center justify-between text-xs shadow-2xs">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                  <div>
                    <span className="font-semibold block text-[11px]">Profile Empty</span>
                    <span className="text-[10px] text-indigo-700">Upload documents or load sample identity to fill fields.</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setActiveStep('PROFILE');
                    reloadProfile();
                  }}
                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-semibold text-[10px] shrink-0 transition cursor-pointer"
                >
                  Open Profile
                </button>
              </div>
            ) : null}

            {/* Approved Decision Plan Badge */}
            {approvedPlan && (
              <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-900 flex items-center justify-between text-[11px] shadow-2xs">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                  <div>
                    <span className="font-semibold block">Decision Plan Active</span>
                    <span className="text-[10px] text-indigo-700">
                      Using approved mappings ({approvedPlan.filter((p) => p.targetValue).length} fields mapped).
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setActiveStep('DECIDED')}
                  className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[10px] font-semibold transition cursor-pointer"
                >
                  Edit in Decide
                </button>
              </div>
            )}

            {/* Top Action Bar: Apply All & Undo */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-xs text-slate-800 flex items-center space-x-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Fill Execution (M3 Preview & Act)</span>
                  </h3>
                  <p className="text-[10px] text-slate-500">
                    Bubbling events + native setters ensure React state registers.
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {readyToFillCount} Ready
                </span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={applyAllFills}
                  disabled={loading || readyToFillCount === 0}
                  className="flex-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-semibold shadow-2xs flex items-center justify-center space-x-1.5 transition disabled:opacity-50 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Fill All Matching Fields</span>
                </button>

                <button
                  onClick={undoAllFills}
                  disabled={loading || undoHistory.length === 0}
                  className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-medium border border-slate-300 flex items-center space-x-1 transition disabled:opacity-40 cursor-pointer"
                  title="Undo all applied fills and restore previous values"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Undo ({undoHistory.length})</span>
                </button>
              </div>
            </div>

            {/* Field Fill Preview Cards */}
            <div className="space-y-2">
              <span className="text-[11px] font-semibold text-slate-700 block">
                Field Mapping & Preview List
              </span>

              {fieldFillPlan.map((item) => {
                const feedback = fillFeedback[item.field.id];

                return (
                  <div
                    key={item.field.id}
                    onMouseEnter={() => previewField(item.field)}
                    className={`p-2.5 bg-white rounded-lg border shadow-2xs transition space-y-1.5 ${
                      item.field.isInsideIframe
                        ? 'border-purple-200 bg-purple-50/10'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="font-semibold text-[11px] text-slate-800 flex items-center space-x-1">
                        <span>{item.field.label}</span>
                        {item.field.required && <span className="text-red-500">*</span>}
                      </div>
                      <div className="flex items-center space-x-1">
                        {item.field.isInsideIframe && (
                          <span className="px-1.5 py-0.2 rounded text-[8px] font-semibold bg-purple-100 text-purple-700 border border-purple-200">
                            iframe
                          </span>
                        )}
                        <span className="px-1.5 py-0.2 rounded text-[8px] font-mono bg-slate-100 text-slate-600 uppercase">
                          {item.field.type}
                        </span>
                      </div>
                    </div>

                    {/* Preview Old -> New Value */}
                    <div className="bg-slate-50 p-2 rounded border border-slate-200 text-[11px] space-y-1">
                      <div className="flex items-center justify-between text-slate-500 text-[10px]">
                        <span>Current on page:</span>
                        <span className="font-mono text-slate-700 truncate max-w-[160px]">
                          {item.currentValue || '<empty>'}
                        </span>
                      </div>

                      {item.targetValue ? (
                        <div className="flex items-center justify-between text-emerald-800 font-medium">
                          <span>Target fill value:</span>
                          <span className="font-mono font-bold text-emerald-700 truncate max-w-[160px]">
                            {item.targetValue}
                          </span>
                        </div>
                      ) : (
                        <div className="text-amber-700 text-[10px] flex items-center space-x-1">
                          <AlertTriangle className="w-3 h-3 text-amber-500" />
                          <span>{item.reason}</span>
                        </div>
                      )}
                    </div>

                    {/* Feedback result */}
                    {feedback && (
                      <div
                        className={`text-[10px] p-1.5 rounded flex items-center space-x-1.5 ${
                          feedback.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
                        }`}
                      >
                        {feedback.ok ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Successfully filled and registered with page.</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                            <span>{feedback.reason}</span>
                          </>
                        )}
                      </div>
                    )}

                    {/* Action buttons (Apply / Undo) */}
                    <div className="flex items-center justify-end space-x-1.5 pt-1">
                      {undoHistory.some((u) => u.fieldId === item.field.id || u.selector === item.field.selector) && (
                        <button
                          onClick={() => undoSingleFill(item.field.id)}
                          disabled={loading}
                          className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded text-[9.5px] font-semibold text-slate-700 flex items-center space-x-1 cursor-pointer transition"
                          title="Undo fill for this field and restore previous value"
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                          <span>Undo Field</span>
                        </button>
                      )}
                      {item.status === 'ready' && (
                        <button
                          onClick={() => applySingleFill(item.field, item.targetValue)}
                          disabled={loading}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 border border-slate-200 rounded text-[10px] font-semibold text-slate-700 transition cursor-pointer flex items-center space-x-1"
                        >
                          <Play className="w-2.5 h-2.5" />
                          <span>Apply</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab View: OBSERVED */}
        {activeStep === 'OBSERVED' && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700 text-xs flex items-center space-x-1">
                <FileText className="w-3.5 h-3.5 text-indigo-600" />
                <span>Detected Form Fields ({schema?.fields.length || 0})</span>
              </span>
              <span className="text-[10px] text-slate-500 font-mono">all_frames: true</span>
            </div>

            {(!schema || schema.fields.length === 0) ? (
              <div className="bg-white rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-500">
                <Layers className="w-8 h-8 mx-auto text-slate-400 mb-2 stroke-1" />
                <p className="font-medium text-slate-700">No form inputs detected</p>
                <button
                  onClick={() => triggerScanOnActiveTab()}
                  className="mt-3 px-3 py-1.5 bg-indigo-600 text-white rounded-md text-xs font-medium hover:bg-indigo-700 transition cursor-pointer"
                >
                  Scan Current Page
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {schema.fields.map((f, idx) => (
                  <div
                    key={f.id || idx}
                    className={`p-2.5 bg-white rounded-lg border shadow-2xs transition ${
                      f.isInsideIframe
                        ? 'border-purple-200 hover:border-purple-300 bg-purple-50/20'
                        : 'border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="font-medium text-slate-800 text-[11px] leading-snug">
                        {f.label}
                        {f.required && <span className="text-red-500 ml-1 font-bold">*</span>}
                      </div>
                      <div className="flex items-center space-x-1 shrink-0">
                        {f.isInsideIframe && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-purple-100 text-purple-700 border border-purple-200">
                            iframe
                          </span>
                        )}
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-medium uppercase tracking-wider bg-slate-100 text-slate-600">
                          {f.type}
                        </span>
                      </div>
                    </div>

                    <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                      <span className="font-mono text-slate-400 truncate max-w-[170px]">
                        name: {f.name}
                      </span>
                      <div className="flex items-center space-x-1">
                        {f.labelSource && (
                          <span className="px-1 py-0.2 rounded text-[8px] font-mono bg-slate-100 text-slate-500">
                            {f.labelSource}
                          </span>
                        )}
                        {f.iframeIdentifier && (
                          <span className="font-mono text-[9px] text-purple-600 truncate max-w-[120px]">
                            frame: {f.iframeIdentifier}
                          </span>
                        )}
                      </div>
                    </div>

                    {f.hint && (
                      <div className="mt-1.5 px-2 py-1 bg-amber-50/60 rounded text-[10px] text-amber-800 border-l-2 border-amber-400 flex items-center justify-between">
                        <span>{f.hint}</span>
                        {f.maxSizeBytes && (
                          <span className="font-mono text-[9px] font-bold text-amber-900 bg-amber-100/80 px-1 rounded ml-1 shrink-0">
                            Limit: {Math.round(f.maxSizeBytes / 1024)} KB
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab View: DECIDE (M5 AI Field Matching) */}
        {activeStep === 'DECIDED' && (
          <DecideView
            fields={schema?.fields || []}
            profileRecords={profileRecords}
            isVaultUnlocked={isVaultUnlocked}
            onUnlockVaultRequested={() => {
              setActiveStep('PROFILE');
              reloadProfile();
            }}
            onPlanApproved={(approved) => {
              setApprovedPlan(approved);
              setActiveStep('ACTED');
              setStatusMessage(`Approved plan with ${approved.filter((a) => a.targetValue).length} fields ready.`);
            }}
            onPreviewField={previewField}
            onProfileUpdated={reloadProfile}
            activeUrl={activeTabInfo.url}
          />
        )}

        {/* Tab View: PROFILE (M4 Documents & Profile Vault) */}
        {activeStep === 'PROFILE' && (
          <div className="space-y-3">
            <div className="p-2.5 bg-white rounded-lg border border-slate-200 shadow-2xs">
              <div className="font-semibold text-xs text-slate-800 flex items-center space-x-1.5">
                <FileText className="w-3.5 h-3.5 text-indigo-600" />
                <span>Documents & Profile Vault (M4)</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Rule 1: Profile credentials & documents are encrypted locally. Values are bound strictly on-device.
              </p>
            </div>
            <DocumentsAndProfileView onProfileUpdated={reloadProfile} />
          </div>
        )}

        {/* Tab View: NEEDS_YOU */}
        {activeStep === 'NEEDS_YOU' && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700 text-xs flex items-center space-x-1">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                <span>Guided Fallback & Manual Review ({needsYouCount})</span>
              </span>
            </div>

            {needsYouCount === 0 ? (
              <div className="bg-white rounded-lg border border-slate-200 p-6 text-center text-slate-500">
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2 stroke-1" />
                <p className="font-medium text-slate-700">No unresolved fields</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  All detected fields have matching values or are intentionally guarded.
                </p>
              </div>
            ) : (
              fieldFillPlan
                .filter((p) => p.status === 'needs-you')
                .map((item) => (
                  <div
                    key={item.field.id}
                    className="p-3 bg-white rounded-lg border border-amber-200 shadow-2xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800 text-[11px]">
                        {item.field.label}
                      </span>
                      <span className="px-1.5 py-0.2 rounded text-[8px] font-mono bg-amber-100 text-amber-800">
                        NEEDS INPUT
                      </span>
                    </div>
                    <p className="text-[10px] text-amber-700">
                      Rule 7: Fallback active. Please provide this field manually on the page or review below.
                    </p>
                    <div className="text-[10px] font-mono bg-slate-50 p-1.5 rounded text-slate-600">
                      Selector: {item.field.selector}
                    </div>
                  </div>
                ))
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="p-2.5 bg-white border-t border-slate-200 flex items-center justify-between text-[11px]">
        <div className="flex items-center space-x-1.5 text-emerald-700 font-medium">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Local Privacy Active</span>
        </div>
        <span className="text-slate-400 text-[10px]">v1.0.0 (M8)</span>
      </footer>

      {/* Timeline Drawer (M8) */}
      <TimelineDrawer isOpen={showTimeline} onClose={() => setShowTimeline(false)} />
    </div>
  );
}

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Lock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  Eye,
  EyeOff,
  Settings,
  Paperclip,
  Trash2,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  Sparkles,
  RotateCcw,
  Shield,
} from 'lucide-react';
import { FormSchema, FormField, ExtensionMessage } from '../../src/types';
import { DocumentsAndProfileView } from './DocumentsAndProfileView';
import { runDecisionEngine, DecisionPlanItem } from '../../src/decide/decisionEngine';
import {
  isStorageUnlocked,
  getAllDecryptedProfileRecords,
  getAllStoredDocuments,
  initializeOrUnlockStorage,
  saveProfileRecord,
  lockStorage,
  clearAllStorageData,
  clearMappingCache,
} from '../../src/storage/db';
import { ProfileRecord } from '../../src/types/profile';
import { UndoRecord } from '../../src/fillers/formFiller';
import { TimelineDrawer } from '../../src/timeline/TimelineDrawer';

const cleanDisplayLabel = (label: string): string => {
  return (label || '').replace(/\s*\*+\s*$/, '').trim();
};

const formatSchemaFoundMessage = (fields: FormField[]): string => {
  const docs = fields.filter((f) => f.type === 'file' || f.type === 'dropzone').length;
  const captchas = fields.filter((f) => f.name.toLowerCase().includes('captcha') || f.id.toLowerCase().includes('captcha')).length;
  const questions = fields.length - docs - captchas;

  const parts: string[] = [];
  if (questions > 0) parts.push(`${questions} question${questions > 1 ? 's' : ''}`);
  if (docs > 0) parts.push(`${docs} document${docs > 1 ? 's' : ''}`);
  if (captchas > 0) parts.push(`${captchas} check`);

  return `Found ${parts.join(', ')} on this form.`;
};

const getFieldOptions = (field: FormField): Array<{ label: string; value: string }> => {
  if (field.options && field.options.length > 0) return field.options;
  const lower = `${field.id} ${field.name} ${field.label}`.toLowerCase();
  if (lower.includes('scheme')) {
    return [
      { label: 'Post-Matric Merit Scholarship (2025)', value: 'merit' },
      { label: 'National Higher Education Fellowship', value: 'national_fellowship' },
      { label: 'State STEM Women Scholarship Scheme', value: 'stem_women' },
      { label: 'Minority Student Excellence Grant', value: 'minority' },
    ];
  }
  if (lower.includes('category')) {
    return [
      { label: 'General', value: 'GENERAL' },
      { label: 'Other Backward Class (OBC)', value: 'OBC' },
      { label: 'Scheduled Caste (SC)', value: 'SC' },
      { label: 'Scheduled Tribe (ST)', value: 'ST' },
      { label: 'Economically Weaker Section (EWS)', value: 'EWS' },
    ];
  }
  return [];
};

export default function App() {
  // Navigation: 'form' (main review & fill) | 'documents' (manage documents & saved details) | 'settings'
  const [currentScreen, setCurrentScreen] = useState<'form' | 'documents' | 'settings'>('form');

  // Vault state
  const [isVaultUnlocked, setIsVaultUnlocked] = useState<boolean>(isStorageUnlocked());
  const [passphraseInput, setPassphraseInput] = useState<string>('');
  const [passphraseError, setPassphraseError] = useState<string>('');
  const [isUnlocking, setIsUnlocking] = useState<boolean>(false);

  // Form observation & fill state
  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [hasScannedOnce, setHasScannedOnce] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('Looking at your form...');
  const [activeTabInfo, setActiveTabInfo] = useState<{ id?: number; url?: string; title?: string }>({});
  const [profileRecords, setProfileRecords] = useState<ProfileRecord[]>([]);
  const [storedDocCount, setStoredDocCount] = useState<number>(0);
  const [planItems, setPlanItems] = useState<DecisionPlanItem[]>([]);
  const [undoHistory, setUndoHistory] = useState<UndoRecord[]>([]);
  const [fillFeedback, setFillFeedback] = useState<Record<string, { ok: boolean; reason?: string }>>({});

  // Review screen controls
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editValueInput, setEditValueInput] = useState<string>('');
  const [inlineAddValues, setInlineAddValues] = useState<Record<string, string>>({});
  const [manualValues, setManualValues] = useState<Record<string, string>>({});
  const [justSavedFieldId, setJustSavedFieldId] = useState<string | null>(null);
  const [quickAttachVisible, setQuickAttachVisible] = useState<boolean>(true);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [showTimeline, setShowTimeline] = useState<boolean>(false);
  const [language, setLanguage] = useState<string>('en');

  // Load language preference
  useEffect(() => {
    chrome.storage?.local?.get(['formpilot_language'], (res) => {
      if (res?.formpilot_language) setLanguage(res.formpilot_language);
    });
  }, []);

  // Sync profile data and vault status
  const reloadProfile = useCallback(async () => {
    const unlocked = isStorageUnlocked();
    setIsVaultUnlocked(unlocked);
    if (unlocked) {
      try {
        const [records, docs] = await Promise.all([
          getAllDecryptedProfileRecords(),
          getAllStoredDocuments(),
        ]);
        setProfileRecords(records);
        setStoredDocCount(docs.length);
      } catch (e) {
        console.warn('[FormPilot] Failed to load decrypted profile records', e);
      }
    } else {
      setProfileRecords([]);
      setStoredDocCount(0);
    }
  }, []);

  useEffect(() => {
    reloadProfile();
  }, [reloadProfile]);

  const getActiveTab = useCallback(async (): Promise<chrome.tabs.Tab | undefined> => {
    try {
      const activeTabs = await chrome.tabs.query({ active: true });
      const webTab = activeTabs.find((t) => t.url && (t.url.startsWith('http://') || t.url.startsWith('https://') || t.url.startsWith('file://')));
      if (webTab) return webTab;
      const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (currentTab?.id && currentTab.url && !currentTab.url.startsWith('chrome://') && !currentTab.url.startsWith('chrome-extension://')) {
        return currentTab;
      }
      return activeTabs[0];
    } catch {
      return undefined;
    }
  }, []);

  // Scan the current form
  const triggerScanOnActiveTab = useCallback(async () => {
    setLoading(true);
    setStatusMessage('Looking at your form...');

    const tab = await getActiveTab();
    if (!tab?.id) {
      setLoading(false);
      setHasScannedOnce(true);
      setStatusMessage("I can't find a form on this page. Open your application form and try again.");
      return;
    }

    setActiveTabInfo({ id: tab.id, url: tab.url, title: tab.title });

    // Instantly check for cached schema from background to avoid blank-screen delay
    chrome.runtime.sendMessage(
      { type: 'GET_ACTIVE_SCHEMA', payload: { tabId: tab.id } } as ExtensionMessage,
      (cachedResp) => {
        if (cachedResp?.payload && cachedResp.payload.fields?.length > 0) {
          setSchema(cachedResp.payload);
          setStatusMessage(formatSchemaFoundMessage(cachedResp.payload.fields));
          setLoading(false);
          setHasScannedOnce(true);
        }
      }
    );

    chrome.runtime.sendMessage(
      { type: 'TRIGGER_SCAN_ALL_FRAMES', payload: { tabId: tab.id } } as ExtensionMessage,
      (resp) => {
        if (resp?.schema && resp.schema.fields && resp.schema.fields.length > 0) {
          setSchema(resp.schema);
          setStatusMessage(formatSchemaFoundMessage(resp.schema.fields));
          setLoading(false);
          setHasScannedOnce(true);
        } else if (chrome.runtime.lastError || !resp?.success) {
          // If TRIGGER_SCAN_ALL_FRAMES failed, try INJECT_AND_SCAN while loading remains true
          chrome.runtime.sendMessage(
            { type: 'INJECT_AND_SCAN', payload: { tabId: tab.id! } } as ExtensionMessage,
            (bgResp) => {
              setLoading(false);
              setHasScannedOnce(true);
              if (bgResp?.success && bgResp.schema && bgResp.schema.fields?.length > 0) {
                setSchema(bgResp.schema);
                setStatusMessage(formatSchemaFoundMessage(bgResp.schema.fields));
              } else {
                setSchema((prev) => (prev && prev.fields.length > 0 ? prev : null));
                setStatusMessage("I can't find a form on this page. Open your application form and try again.");
              }
            }
          );
        } else {
          // Response succeeded, but 0 fields detected
          setLoading(false);
          setHasScannedOnce(true);
          setSchema(resp?.schema || null);
          setStatusMessage("I can't find a form on this page. Open your application form and try again.");
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
        if (message.payload && message.payload.fields?.length > 0) {
          setSchema(message.payload);
          setStatusMessage(formatSchemaFoundMessage(message.payload.fields));
          setLoading(false);
          setHasScannedOnce(true);
        }
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);

    return () => {
      chrome.tabs.onActivated.removeListener(tabActivatedListener);
      chrome.tabs.onUpdated.removeListener(tabUpdatedListener);
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [triggerScanOnActiveTab]);

  // Compute matched items whenever schema or profile changes
  const computePlan = useCallback(async () => {
    if (!schema || schema.fields.length === 0) {
      setPlanItems([]);
      return;
    }

    try {
      const res = await runDecisionEngine({
        fields: schema.fields,
        urlOrOrigin: schema.url,
        profileRecords,
        manualValues,
      });
      setPlanItems(res.items);
    } catch (err) {
      console.warn('[FormPilot] Decision matching error:', err);
    }
  }, [schema, profileRecords, isVaultUnlocked, manualValues]);

  useEffect(() => {
    computePlan();
  }, [computePlan]);

  // Toggle masking for sensitive numbers (Aadhaar, Bank, PAN)
  const toggleReveal = (keyOrId: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(keyOrId)) next.delete(keyOrId);
      else next.add(keyOrId);
      return next;
    });
  };

  const isSensitiveField = (label: string, key?: string | null) => {
    const text = `${label} ${key || ''}`.toLowerCase();
    return (
      text.includes('aadhaar') ||
      text.includes('uid') ||
      text.includes('pan') ||
      text.includes('bank') ||
      text.includes('account') ||
      text.includes('ifsc') ||
      text.includes('password')
    );
  };

  const maskValue = (val: string) => {
    if (!val) return '';
    if (val.length <= 4) return '••••';
    return '•••• •••• ' + val.slice(-4);
  };

  // Unlock vault
  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassphraseError('');
    if (!passphraseInput.trim()) {
      setPassphraseError('Please enter your password.');
      return;
    }

    setIsUnlocking(true);
    try {
      const ok = await initializeOrUnlockStorage(passphraseInput.trim());
      if (ok) {
        chrome.runtime.sendMessage({
          type: 'UNLOCK_STORAGE',
          payload: { passphrase: passphraseInput.trim() },
        }).catch(() => {});
        setIsVaultUnlocked(true);
        setPassphraseInput('');
        await reloadProfile();
      } else {
        setPassphraseError('Incorrect password. Please try again.');
      }
    } catch (err) {
      setPassphraseError('Could not unlock. Please try again.');
    } finally {
      setIsUnlocking(false);
    }
  };

  // Lock vault
  const handleLock = () => {
    lockStorage();
    chrome.runtime.sendMessage({ type: 'LOCK_STORAGE' }).catch(() => {});
    setIsVaultUnlocked(false);
    setProfileRecords([]);
    setPlanItems([]);
    setCurrentScreen('form');
  };

  // Fill all ready fields
  const handleFillAll = async () => {
    const tab = await getActiveTab();
    if (!tab?.id) return;

    const itemsToFill = planItems
      .filter((item) => (item.status === 'ready' || item.status === 'needs-review') && item.targetValue)
      .map((item) => ({ field: item.field, value: item.targetValue }));

    if (itemsToFill.length === 0) {
      alert("I don't have enough information to fill any questions yet. Please add your documents or type in the missing details.");
      return;
    }

    setLoading(true);
    setStatusMessage(`Filling ${itemsToFill.length} questions for you...`);

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
          const successCount = resp.results.filter((r: any) => r.ok).length;
          setStatusMessage(`Filled ${successCount} questions successfully! Please review them on the form.`);
        }
      }
    );
  };

  // Fill single field
  const handleFillSingle = async (field: FormField, value: string) => {
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

  // Undo all fills
  const handleUndoAll = async () => {
    if (undoHistory.length === 0) return;
    const tab = await getActiveTab();
    if (!tab?.id) return;

    setLoading(true);
    setStatusMessage('Undoing filled answers...');

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
          setStatusMessage(`Restored ${resp.undoneCount} answers back to how they were.`);
        }
      }
    );
  };

  // Undo single field
  const handleUndoSingle = async (fieldId: string) => {
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
          setStatusMessage('Restored previous answer for this question.');
        }
      }
    );
  };

  // Save inline change
  const handleSaveInlineEdit = (fieldId: string) => {
    const trimmed = editValueInput.trim();
    setManualValues((prev) => ({ ...prev, [fieldId]: trimmed }));
    setPlanItems((prev) =>
      prev.map((item) => {
        if (item.field.id === fieldId) {
          return {
            ...item,
            targetValue: trimmed,
            status: 'ready',
            reason: 'You changed this answer',
            isManualOverride: true,
          };
        }
        return item;
      })
    );
    setEditingFieldId(null);
  };

  // Save inline missing detail
  const handleSaveMissingDetail = async (field: FormField, key: string, value: string) => {
    if (!value.trim()) return;
    const trimmed = value.trim();

    // Determine normalized profile key
    let profileKey = key;
    const lower = `${field.label || ''} ${field.name || ''} ${key}`.toLowerCase();
    if (lower.includes('occupation') || lower.includes('profession') || lower.includes('व्यवसाय')) {
      profileKey = 'guardianOccupation';
    }

    // Save in encrypted vault under both normalized key and exact field name
    await saveProfileRecord({
      key: profileKey,
      value: trimmed,
      confidence: 1.0,
      source: 'manual',
      verifiedByUser: true,
    });

    if (field.name && field.name !== profileKey) {
      await saveProfileRecord({
        key: field.name,
        value: trimmed,
        confidence: 1.0,
        source: 'manual',
        verifiedByUser: true,
      });
    }

    // Set manual value override so it stays ready in decisionEngine
    setManualValues((prev) => ({ ...prev, [field.id]: trimmed }));

    // Instant local planItems update: move from missing to ready immediately!
    setPlanItems((prev) =>
      prev.map((item) => {
        if (item.field.id === field.id) {
          return {
            ...item,
            profileKey,
            targetValue: trimmed,
            status: 'ready',
            confidence: 1.0,
            reason: 'You saved this answer',
            isManualOverride: true,
          };
        }
        return item;
      })
    );

    // Show visual confirmation badge
    setJustSavedFieldId(field.id);
    setTimeout(() => {
      setJustSavedFieldId((curr) => (curr === field.id ? null : curr));
    }, 4000);

    // Clear input value for this field
    setInlineAddValues((prev) => {
      const next = { ...prev };
      delete next[field.id];
      return next;
    });

    // Reload profile records
    await reloadProfile();
  };

  // Toggle quick-attach boxes
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

  // Group items cleanly for the Review Screen (Phase 3 Requirement 4: Group missing items at the top)
  const missingItems = useMemo(() => {
    return planItems.filter((i) => {
      const isCaptcha = i.field.name.toLowerCase().includes('captcha') || i.field.id.toLowerCase().includes('captcha');
      const isFile = i.field.type === 'file' || i.field.type === 'dropzone';
      return !isCaptcha && !isFile && (!i.targetValue || i.status === 'missing-data' || i.status === 'unmapped');
    });
  }, [planItems]);

  const checkItems = useMemo(() => {
    return planItems.filter((i) => {
      const isCaptcha = i.field.name.toLowerCase().includes('captcha') || i.field.id.toLowerCase().includes('captcha');
      const isFile = i.field.type === 'file' || i.field.type === 'dropzone';
      return !isCaptcha && !isFile && Boolean(i.targetValue) && i.status === 'needs-review';
    });
  }, [planItems]);

  const readyItems = useMemo(() => {
    return planItems.filter((i) => {
      const isCaptcha = i.field.name.toLowerCase().includes('captcha') || i.field.id.toLowerCase().includes('captcha');
      const isFile = i.field.type === 'file' || i.field.type === 'dropzone';
      return !isCaptcha && !isFile && Boolean(i.targetValue) && i.status === 'ready';
    });
  }, [planItems]);

  const documentSlots = useMemo(() => {
    return planItems.filter((i) => i.field.type === 'file' || i.field.type === 'dropzone');
  }, [planItems]);

  const manualOnlyItems = useMemo(() => {
    return planItems.filter((i) => i.field.name.toLowerCase().includes('captcha') || i.field.id.toLowerCase().includes('captcha'));
  }, [planItems]);

  // Current stepper step
  const currentStepNumber = useMemo(() => {
    if (!isVaultUnlocked || (storedDocCount === 0 && profileRecords.length === 0)) return 1;
    if (!schema || schema.fields.length === 0) return 2;
    if (readyItems.length > 0 && undoHistory.length === 0) return 3;
    return 4;
  }, [isVaultUnlocked, storedDocCount, profileRecords.length, schema, readyItems.length, undoHistory.length]);

  return (
    <div className="flex flex-col h-screen text-slate-800 bg-white font-sans select-none text-base">
      {/* ── TOP HEADER ── */}
      <header className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between shadow-2xs">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold shadow-xs">
            <span className="text-lg">✈️</span>
          </div>
          <div>
            <h1 className="font-bold text-lg text-slate-900 leading-tight">FormPilot</h1>
            <p className="text-xs text-slate-500 font-medium">Automatic form helper</p>
          </div>
        </div>

        {/* Header navigation & tools */}
        <div className="flex items-center space-x-1.5">
          {currentScreen === 'form' ? (
            <>
              <button
                onClick={toggleQuickAttach}
                className={`p-1.5 rounded-md transition cursor-pointer ${
                  quickAttachVisible ? 'bg-indigo-50 text-indigo-700' : 'text-slate-400 hover:bg-slate-100'
                }`}
                title={quickAttachVisible ? 'Attach boxes on page: Visible' : 'Attach boxes on page: Hidden'}
                aria-label="Toggle attach boxes"
              >
                <Paperclip className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => setCurrentScreen('documents')}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-semibold flex items-center space-x-1 transition cursor-pointer"
                title="View and add your documents"
              >
                <FolderOpen className="w-3.5 h-3.5 text-indigo-600" />
                <span>Documents</span>
                {storedDocCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 bg-indigo-600 text-white rounded-full text-[10px]">
                    {storedDocCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => setCurrentScreen('settings')}
                className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 transition cursor-pointer"
                title="Settings"
                aria-label="Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setCurrentScreen('form')}
              className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-md text-xs font-bold flex items-center space-x-1 transition cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Form</span>
            </button>
          )}
        </div>
      </header>

      {/* ── SCREEN 1: LOCKED VAULT ── */}
      {!isVaultUnlocked && (
        <div className="flex-1 p-6 flex flex-col justify-center items-center text-center space-y-4 max-w-sm mx-auto">
          <div className="w-14 h-14 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Lock className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-slate-900">Unlock your documents</h2>
            <p className="text-sm text-slate-500 leading-snug">
              Enter your password to use your saved details. If this is your first time, create any password you will remember.
            </p>
          </div>

          <form onSubmit={handleUnlock} className="w-full space-y-3 pt-2">
            <input
              type="password"
              value={passphraseInput}
              onChange={(e) => setPassphraseInput(e.target.value)}
              placeholder="Enter your password"
              className="w-full px-3.5 py-2.5 text-base rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
              autoFocus
            />

            {passphraseError && (
              <p className="text-xs text-red-600 font-semibold text-left">{passphraseError}</p>
            )}

            <button
              type="submit"
              disabled={isUnlocking}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-base font-bold shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              {isUnlocking ? 'Unlocking...' : 'Unlock My Documents'}
            </button>
          </form>
        </div>
      )}

      {/* ── SCREEN 2: DOCUMENTS MANAGER ── */}
      {isVaultUnlocked && currentScreen === 'documents' && (
        <div className="flex-1 overflow-y-auto">
          <DocumentsAndProfileView onProfileUpdated={reloadProfile} />
        </div>
      )}

      {/* ── SCREEN 3: SETTINGS ── */}
      {isVaultUnlocked && currentScreen === 'settings' && (
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <div className="space-y-1 border-b border-slate-200 pb-3">
            <h2 className="text-lg font-bold text-slate-900">Settings</h2>
            <p className="text-xs text-slate-500">Manage your language and on-device privacy.</p>
          </div>

          {/* Language Selection */}
          <div className="space-y-1.5">
            <label className="block text-sm font-bold text-slate-800">Language</label>
            <select
              value={language}
              onChange={(e) => {
                const newLang = e.target.value;
                setLanguage(newLang);
                chrome.storage?.local?.set({ formpilot_language: newLang });
              }}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-800 font-medium"
            >
              <option value="en">English (Default)</option>
              <option value="hi">Hindi (हिंदी)</option>
              <option value="mr">Marathi (मराठी)</option>
              <option value="gu">Gujarati (ગુજરાતી)</option>
              <option value="bn">Bengali (বাংলা)</option>
              <option value="ta">Tamil (தமிழ்)</option>
              <option value="te">Telugu (తెలుగు)</option>
            </select>
          </div>

          {/* API Setup Information */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
            <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-800">
              <Shield className="w-4 h-4 text-emerald-600" />
              <span>Smart Setup (.env file)</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              <strong>What is this?</strong> FormPilot reads matching questions completely on your device first. An AI helper is only consulted if a question is worded unusually, and personal answers are never sent.
            </p>
          </div>

          {/* Lock Documents */}
          <div className="pt-2 border-t border-slate-200">
            <button
              onClick={handleLock}
              className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-sm font-bold flex items-center justify-center space-x-2 transition cursor-pointer"
            >
              <Lock className="w-4 h-4 text-slate-600" />
              <span>Lock my documents now</span>
            </button>
          </div>

          {/* Danger Zone: Delete All Data */}
          <div className="pt-2 border-t border-red-100">
            <button
              onClick={async () => {
                if (confirm('Are you sure? This will delete all your documents and saved details permanently from this computer.')) {
                  await clearAllStorageData();
                  setIsVaultUnlocked(false);
                  setCurrentScreen('form');
                }
              }}
              className="w-full py-2.5 px-4 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-sm font-bold flex items-center justify-center space-x-2 transition cursor-pointer"
            >
              <Trash2 className="w-4 h-4 text-red-600" />
              <span>Delete all my data from this computer</span>
            </button>
          </div>

          {/* Hidden Advanced Section */}
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs text-slate-500 hover:text-slate-800 font-semibold flex items-center space-x-1 cursor-pointer"
            >
              <span>{showAdvanced ? 'Hide Advanced Tools' : 'Show Advanced Tools'}</span>
              {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showAdvanced && (
              <div className="p-3 bg-slate-100 rounded-lg space-y-2 text-xs font-mono text-slate-700">
                <p><strong>URL:</strong> {activeTabInfo.url || 'None'}</p>
                <p><strong>Questions Detected:</strong> {schema?.fields.length || 0}</p>
                <div className="flex items-center space-x-2 pt-1">
                  <button
                    onClick={async () => {
                      await clearMappingCache();
                      alert('Mapping cache cleared.');
                    }}
                    className="px-2.5 py-1 bg-white border border-slate-300 rounded text-xs hover:bg-slate-50 cursor-pointer"
                  >
                    Clear Mapping Cache
                  </button>
                  <button
                    onClick={() => setShowTimeline(true)}
                    className="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-xs hover:bg-indigo-100 cursor-pointer"
                  >
                    Event Timeline
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SCREEN 4: MAIN FORM HELPER (DEFAULT) ── */}
      {isVaultUnlocked && currentScreen === 'form' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 4-STEP CLEAR USER JOURNEY STEPPER */}
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
            <div className="flex items-center justify-between text-xs font-semibold">
              <button
                onClick={toggleQuickAttach}
                className={`p-1.5 rounded-md transition cursor-pointer ${
                  quickAttachVisible ? 'bg-indigo-50 text-indigo-700' : 'text-slate-400 hover:bg-slate-100'
                }`}
                title={quickAttachVisible ? 'Attach boxes on page: Visible' : 'Attach boxes on page: Hidden'}
                aria-label="Toggle attach boxes"
              >
                <Paperclip className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => setCurrentScreen('documents')}
                className={`flex items-center space-x-1 cursor-pointer ${
                  storedDocCount > 0 ? 'text-emerald-700 font-bold' : 'text-slate-700'
                }`}
              >
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] text-white ${
                  storedDocCount > 0 ? 'bg-emerald-600' : 'bg-slate-400'
                }`}>1</span>
                <span>Add documents</span>
              </button>

              <span className="text-slate-300">→</span>

              <div className={`flex items-center space-x-1 ${
                schema && schema.fields.length > 0 ? 'text-emerald-700 font-bold' : 'text-slate-700'
              }`}>
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] text-white ${
                  schema && schema.fields.length > 0 ? 'bg-emerald-600' : 'bg-slate-400'
                }`}>2</span>
                <span>Open form</span>
              </div>

              <span className="text-slate-300">→</span>

              <div className={`flex items-center space-x-1 ${
                currentStepNumber === 3 ? 'text-indigo-700 font-bold' : 'text-slate-700'
              }`}>
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] text-white ${
                  currentStepNumber === 3 ? 'bg-indigo-600' : 'bg-slate-400'
                }`}>3</span>
                <span>Fill form</span>
              </div>

              <span className="text-slate-300">→</span>

              <div className={`flex items-center space-x-1 ${
                currentStepNumber === 4 ? 'text-indigo-700 font-bold' : 'text-slate-700'
              }`}>
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] text-white ${
                  currentStepNumber === 4 ? 'bg-indigo-600' : 'bg-slate-400'
                }`}>4</span>
                <span>Check</span>
              </div>
            </div>
          </div>

          {/* MAIN SCROLLABLE CONTENT */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Case A: Scanning/Loading state or awaiting initial scan */}
            {(loading || !hasScannedOnce) && (!schema || schema.fields.length === 0) && (
              <div className="py-12 px-4 text-center space-y-4 max-w-xs mx-auto">
                <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                  <RefreshCw className="w-6 h-6 animate-spin" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-bold text-base text-slate-800">Looking at your form...</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Scanning this page to detect form questions and documents.
                  </p>
                </div>
              </div>
            )}

            {/* Case B: Truly no form detected on page after scan completed */}
            {!loading && hasScannedOnce && (!schema || schema.fields.length === 0) && (
              <div className="py-12 px-4 text-center space-y-4 max-w-xs mx-auto">
                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <HelpCircle className="w-6 h-6" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-bold text-base text-slate-800">No form found on this page</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    I can't find a form on this page. Open your application form and try again.
                  </p>
                </div>
                <div className="pt-2 space-y-2">
                  <button
                    onClick={() => triggerScanOnActiveTab()}
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold flex items-center justify-center space-x-2 transition cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    <span>Scan again</span>
                  </button>

                  <button
                    onClick={() => setCurrentScreen('documents')}
                    className="w-full py-2 px-4 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    Add or check my documents
                  </button>
                </div>
              </div>
            )}

            {/* Case B: Form detected */}
            {schema && schema.fields.length > 0 && (
              <>
                {/* Status Announcement Banner */}
                <div
                  role="status"
                  aria-live="polite"
                  className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl flex items-center justify-between text-xs"
                >
                  <div className="flex items-center space-x-2 text-indigo-900 font-semibold">
                    <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>{statusMessage}</span>
                  </div>

                  <button
                    onClick={() => triggerScanOnActiveTab()}
                    disabled={loading}
                    className="text-indigo-600 hover:text-indigo-800 font-bold flex items-center space-x-1 cursor-pointer"
                    title="Rescan"
                  >
                    <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>

                {/* Primary Action Button (Big, minimum 16px font, clear action) */}
                <div className="space-y-2">
                  <button
                    onClick={handleFillAll}
                    disabled={loading || (readyItems.length === 0 && checkItems.length === 0)}
                    className="w-full py-3.5 px-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-base font-bold shadow-sm flex items-center justify-center space-x-2 transition cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className="w-5 h-5 text-indigo-200" />
                    <span>Fill this form for me</span>
                  </button>

                  {undoHistory.length > 0 && (
                    <button
                      onClick={handleUndoAll}
                      disabled={loading}
                      className="w-full py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                      <span>Undo all fills ({undoHistory.length} answers)</span>
                    </button>
                  )}
                </div>

                {/* ── SECTION 4: REVIEW LIST ("CHECK EVERYTHING") ── */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                    <h3 className="font-bold text-sm text-slate-900">Check everything</h3>
                    <span className="text-xs text-slate-500 font-medium">Review before you submit</span>
                  </div>

                  {/* 1. Missing Items (GROUPED AT THE TOP as requested) */}
                  {missingItems.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center space-x-1.5 text-xs font-bold text-rose-700">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>I need this from you ({missingItems.length})</span>
                      </div>

                      {missingItems.map((item) => (
                        <div
                          key={item.field.id}
                          className="p-3 bg-rose-50/50 border border-rose-200 rounded-xl space-y-2 text-xs"
                        >
                          <div className="flex items-start justify-between">
                            <span className="font-bold text-slate-800 text-sm">
                              {cleanDisplayLabel(item.field.label || item.field.name)}
                              {item.field.required && <span className="text-rose-600 ml-1">*</span>}
                            </span>
                            <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded-full text-[10px] font-bold">
                              Missing
                            </span>
                          </div>

                          <p className="text-slate-600 text-xs">
                            {getFieldOptions(item.field).length > 0
                              ? 'Select an option from the dropdown below:'
                              : "I don't have this in your saved documents yet. Type it below:"}
                          </p>

                          {getFieldOptions(item.field).length > 0 ? (
                            <div className="space-y-1">
                              <select
                                value={inlineAddValues[item.field.id] || item.targetValue || ''}
                                onChange={(e) => {
                                  const chosenVal = e.target.value;
                                  setInlineAddValues((prev) => ({ ...prev, [item.field.id]: chosenVal }));
                                  handleSaveMissingDetail(
                                    item.field,
                                    item.profileKey || item.field.name,
                                    chosenVal
                                  );
                                }}
                                className="w-full px-3 py-2 rounded-lg border border-indigo-300 bg-white text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs"
                              >
                                <option value="" disabled>-- Select an option from the dropdown --</option>
                                {getFieldOptions(item.field).map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label || opt.value}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div className="flex items-center space-x-2">
                              <input
                                type="text"
                                value={inlineAddValues[item.field.id] || ''}
                                onChange={(e) =>
                                  setInlineAddValues((prev) => ({ ...prev, [item.field.id]: e.target.value }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleSaveMissingDetail(
                                      item.field,
                                      item.profileKey || item.field.name,
                                      inlineAddValues[item.field.id] || ''
                                    );
                                  }
                                }}
                                placeholder="Type your answer and press Enter..."
                                className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                              />
                              <button
                                onClick={() =>
                                  handleSaveMissingDetail(
                                    item.field,
                                    item.profileKey || item.field.name,
                                    inlineAddValues[item.field.id] || ''
                                  )
                                }
                                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition cursor-pointer shrink-0"
                              >
                                Save
                              </button>
                            </div>
                          )}

                          {justSavedFieldId === item.field.id && (
                            <div className="text-emerald-700 text-xs font-semibold flex items-center space-x-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>✓ Saved! Added to ready fields.</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 2. Needs Review Items */}
                  {checkItems.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center space-x-1.5 text-xs font-bold text-amber-700">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Please check this ({checkItems.length})</span>
                      </div>

                      {checkItems.map((item) => (
                        <div
                          key={item.field.id}
                          className="p-3 bg-amber-50/50 border border-amber-200 rounded-xl space-y-2 text-xs"
                        >
                          <div className="flex items-start justify-between">
                            <span className="font-bold text-slate-800 text-sm">
                              {cleanDisplayLabel(item.field.label || item.field.name)}
                            </span>
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-[10px] font-bold">
                              Please check
                            </span>
                          </div>

                          {editingFieldId === item.field.id ? (
                            <div className="flex items-center space-x-2">
                              {getFieldOptions(item.field).length > 0 ? (
                                <select
                                  value={editValueInput}
                                  onChange={(e) => setEditValueInput(e.target.value)}
                                  className="flex-1 px-3 py-1.5 rounded-lg border border-indigo-400 bg-white text-xs font-medium text-slate-800 outline-none cursor-pointer"
                                >
                                  {getFieldOptions(item.field).map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label || opt.value}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type="text"
                                  value={editValueInput}
                                  onChange={(e) => setEditValueInput(e.target.value)}
                                  className="flex-1 px-3 py-1.5 rounded-lg border border-indigo-400 bg-white text-xs outline-none"
                                />
                              )}
                              <button
                                onClick={() => handleSaveInlineEdit(item.field.id)}
                                className="px-2.5 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold cursor-pointer"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingFieldId(null)}
                                className="px-2 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-amber-100">
                              {getFieldOptions(item.field).length > 0 ? (
                                <select
                                  value={item.targetValue}
                                  onChange={(e) => {
                                    const chosen = e.target.value;
                                    handleSaveMissingDetail(
                                      item.field,
                                      item.profileKey || item.field.name,
                                      chosen
                                    );
                                  }}
                                  className="flex-1 mr-2 px-2.5 py-1 text-xs font-semibold border border-amber-300 rounded-md bg-white text-slate-800 cursor-pointer outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                  {getFieldOptions(item.field).map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label || opt.value}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="font-medium text-slate-900 truncate max-w-[200px]">
                                  {item.targetValue}
                                </span>
                              )}
                              <div className="flex items-center space-x-1.5">
                                {getFieldOptions(item.field).length === 0 && (
                                  <button
                                    onClick={() => {
                                      setEditingFieldId(item.field.id);
                                      setEditValueInput(item.targetValue);
                                    }}
                                    className="text-xs text-indigo-600 hover:underline font-semibold cursor-pointer"
                                  >
                                    Change
                                  </button>
                                )}
                                <button
                                  onClick={() => handleFillSingle(item.field, item.targetValue)}
                                  className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-xs font-bold cursor-pointer"
                                >
                                  Fill
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 3. Ready Items */}
                  {readyItems.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center space-x-1.5 text-xs font-bold text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Ready to fill ({readyItems.length})</span>
                      </div>

                      {readyItems.map((item) => {
                        const sensitive = isSensitiveField(item.field.label, item.profileKey);
                        const isRevealed = revealedKeys.has(item.field.id);
                        const isFilled = fillFeedback[item.field.id]?.ok;

                        return (
                          <div
                            key={item.field.id}
                            className="p-3 bg-white border border-slate-200 rounded-xl space-y-1.5 text-xs shadow-2xs hover:border-slate-300 transition"
                          >
                            <div className="flex items-start justify-between">
                              <span className="font-semibold text-slate-800 text-sm">
                                {cleanDisplayLabel(item.field.label || item.field.name)}
                              </span>
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold">
                                Ready
                              </span>
                            </div>

                            {editingFieldId === item.field.id ? (
                              <div className="flex items-center space-x-2 pt-1">
                                {getFieldOptions(item.field).length > 0 ? (
                                  <select
                                    value={editValueInput}
                                    onChange={(e) => setEditValueInput(e.target.value)}
                                    className="flex-1 px-3 py-1.5 rounded-lg border border-indigo-400 bg-white text-xs font-medium text-slate-800 outline-none cursor-pointer"
                                  >
                                    {getFieldOptions(item.field).map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label || opt.value}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    type="text"
                                    value={editValueInput}
                                    onChange={(e) => setEditValueInput(e.target.value)}
                                    className="flex-1 px-3 py-1.5 rounded-lg border border-indigo-400 bg-white text-xs outline-none"
                                  />
                                )}
                                <button
                                  onClick={() => handleSaveInlineEdit(item.field.id)}
                                  className="px-2.5 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold cursor-pointer"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingFieldId(null)}
                                  className="px-2 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between pt-0.5">
                                {getFieldOptions(item.field).length > 0 ? (
                                  <select
                                    value={item.targetValue}
                                    onChange={(e) => {
                                      const chosen = e.target.value;
                                      handleSaveMissingDetail(
                                        item.field,
                                        item.profileKey || item.field.name,
                                        chosen
                                      );
                                    }}
                                    className="flex-1 mr-2 px-2.5 py-1.5 text-xs font-semibold border border-indigo-200 rounded-lg bg-indigo-50/50 text-indigo-950 cursor-pointer outline-none hover:border-indigo-400 focus:ring-2 focus:ring-indigo-500 transition"
                                  >
                                    {getFieldOptions(item.field).map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label || opt.value}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <div className="flex items-center space-x-1.5 font-medium text-slate-900 truncate max-w-[200px]">
                                    <span>
                                      {sensitive && !isRevealed ? maskValue(item.targetValue) : item.targetValue}
                                    </span>
                                    {sensitive && (
                                      <button
                                        onClick={() => toggleReveal(item.field.id)}
                                        className="p-0.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                                        title={isRevealed ? 'Hide' : 'Show'}
                                        aria-label={isRevealed ? 'Hide' : 'Show'}
                                      >
                                        {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                      </button>
                                    )}
                                  </div>
                                )}

                                <div className="flex items-center space-x-1.5">
                                  {getFieldOptions(item.field).length === 0 && (
                                    <button
                                      onClick={() => {
                                        setEditingFieldId(item.field.id);
                                        setEditValueInput(item.targetValue);
                                      }}
                                      className="text-xs text-indigo-600 hover:underline font-semibold cursor-pointer"
                                    >
                                      Change
                                    </button>
                                  )}
                                  {isFilled ? (
                                    <button
                                      onClick={() => handleUndoSingle(item.field.id)}
                                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-semibold cursor-pointer"
                                    >
                                      Undo
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleFillSingle(item.field, item.targetValue)}
                                      className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-xs font-bold cursor-pointer"
                                    >
                                      Fill
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* 4. Document upload slots */}
                  {documentSlots.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-700">
                        <Paperclip className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Documents to attach ({documentSlots.length})</span>
                      </div>

                      {documentSlots.map((item) => (
                        <div
                          key={item.field.id}
                          className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs"
                        >
                          <span className="font-bold text-slate-800 text-sm">
                            {cleanDisplayLabel(item.field.label || item.field.name)}
                          </span>
                          <p className="text-slate-500 text-xs">
                            Upload slot detected. Use the floating 📎 box on the webpage to attach your document in one click.
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 5. Safe Handback items (CAPTCHAs, OTPs) */}
                  {manualOnlyItems.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-700">
                        <Shield className="w-3.5 h-3.5 text-amber-600" />
                        <span>Please complete this yourself</span>
                      </div>

                      {manualOnlyItems.map((item) => (
                        <div
                          key={item.field.id}
                          className="p-3 bg-amber-50/40 border border-amber-200 rounded-xl space-y-1 text-xs"
                        >
                          <span className="font-bold text-slate-800 text-sm">
                            {cleanDisplayLabel(item.field.label || item.field.name)}
                          </span>
                          <p className="text-slate-600 text-xs">
                            For your security, verification questions and final submission must always be completed by you on the page.
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── AGENT REASONING TIMELINE DRAWER (ADVANCED ONLY) ── */}
      {showTimeline && (
        <TimelineDrawer
          isOpen={showTimeline}
          onClose={() => setShowTimeline(false)}
        />
      )}
    </div>
  );
}

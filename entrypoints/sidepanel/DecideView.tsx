import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Sparkles,
  AlertTriangle,
  Play,
  Lock,
  Layers,
  Info,
  ShieldCheck,
  ChevronDown,
  Loader2,
  Wand2,
  Sliders,
  PlusCircle,
  Database,
  Trash2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { FormField } from '../../src/types';
import { ProfileRecord, StandardProfileKeysSchema, StoredDocument } from '../../src/types/profile';
import {
  runDecisionEngine,
  DecisionPlanItem,
} from '../../src/decide/decisionEngine';
import { clearMappingCache, saveProfileRecord, getAllStoredDocuments } from '../../src/storage/db';
import { PreFillChecklistCard } from '../../src/checks/PreFillChecklistCard';
import { timelineStore } from '../../src/timeline/timelineStore';

interface DecideViewProps {
  fields: FormField[];
  profileRecords: ProfileRecord[];
  isVaultUnlocked: boolean;
  onUnlockVaultRequested: () => void;
  onPlanApproved: (approvedPlan: DecisionPlanItem[]) => void;
  onPreviewField?: (field: FormField) => void;
  onProfileUpdated?: () => void;
  activeUrl?: string;
}

export const DecideView: React.FC<DecideViewProps> = ({
  fields,
  profileRecords,
  isVaultUnlocked,
  onUnlockVaultRequested,
  onPlanApproved,
  onPreviewField,
  onProfileUpdated,
  activeUrl = window.location.href,
}) => {
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [planItems, setPlanItems] = useState<DecisionPlanItem[]>([]);
  const [missingKeys, setMissingKeys] = useState<string[]>([]);
  const [fromCache, setFromCache] = useState(false);
  const [confirmedLowConfFields, setConfirmedLowConfFields] = useState<Record<string, boolean>>({});
  const [manualOverrides, setManualOverrides] = useState<Record<string, string | null>>({});
  const [storedDocs, setStoredDocs] = useState<Array<Omit<StoredDocument, 'encryptedBlob'>>>([]);

  useEffect(() => {
    getAllStoredDocuments().then((docs) => setStoredDocs(docs)).catch(() => {});
  }, [isVaultUnlocked]);

  // Quick manual add detail modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addKey, setAddKey] = useState('');
  const [addValue, setAddValue] = useState('');

  const candidateKeys = useMemo(() => {
    return Object.keys(StandardProfileKeysSchema.shape);
  }, []);

  const executeDecisionPlan = useCallback(
    async (forceFresh: boolean = false) => {
      if (fields.length === 0) {
        setPlanItems([]);
        setMissingKeys([]);
        return;
      }

      setLoading(true);
      setErrorMessage(null);
      setStatusMessage(forceFresh ? 'Re-analyzing fields...' : 'Analyzing fields & checking cache...');

      try {
        // Read stored API config for selective LLM
        let apiConfig: any = undefined;
        try {
          const stored = await chrome.storage.local.get([
            'geminiApiKey',
            'claudeApiKey',
            'geminiModel',
            'claudeModel',
            'provider',
          ]);
          apiConfig = stored;
        } catch {
          // Extension storage not accessible in test environment
        }

        const result = await runDecisionEngine({
          fields,
          urlOrOrigin: activeUrl,
          profileRecords,
          apiConfig,
          forceFresh,
          manualOverrides,
        });

        setPlanItems(result.items);
        setMissingKeys(result.missingProfileKeys);
        setFromCache(result.fromCache);

        if (result.llmInvoked) {
          setStatusMessage(
            `Matched ${result.items.filter((i) => i.profileKey).length}/${fields.length} fields (${result.llmFieldsCount} via selective LLM).`
          );
        } else if (result.fromCache) {
          setStatusMessage(`Loaded ${result.items.length} field mappings from Dexie signature cache.`);
        } else {
          setStatusMessage(`Matched ${result.items.filter((i) => i.profileKey).length}/${fields.length} fields via local heuristics.`);
        }

        timelineStore.addEvent({
          stage: 'DECIDE',
          title: result.fromCache ? 'Loaded Plan from Cache' : 'Decision Plan Computed',
          description: `Evaluated ${fields.length} fields (${result.items.filter((i) => i.profileKey).length} mapped, ${result.missingProfileKeys.length} missing values).`,
          status: 'info',
        });
      } catch (err: any) {
        console.error('[DecideView] Error executing decision plan:', err);
        setErrorMessage(err?.message || String(err));
      } finally {
        setLoading(false);
      }
    },
    [fields, activeUrl, profileRecords, manualOverrides]
  );

  useEffect(() => {
    executeDecisionPlan(false);
  }, [executeDecisionPlan]);

  // Handle manual profile key change (remembers correction in cache)
  const handleKeyOverride = (fieldId: string, newKey: string) => {
    const chosenKey = newKey === '__NONE__' ? null : newKey;
    const updatedOverrides = { ...manualOverrides, [fieldId]: chosenKey };
    setManualOverrides(updatedOverrides);
  };

  // Toggle confirmation for fields under 0.75 confidence
  const toggleConfirmField = (fieldId: string) => {
    setConfirmedLowConfFields((prev) => ({
      ...prev,
      [fieldId]: !prev[fieldId],
    }));
  };

  // Handle clearing Dexie mapping cache
  const handleClearCache = async () => {
    await clearMappingCache();
    setFromCache(false);
    setStatusMessage('Dexie mapping cache cleared. Re-running matching...');
    executeDecisionPlan(true);
  };

  // Quick manual add detail submission
  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addKey || !addValue.trim()) return;

    try {
      await saveProfileRecord({
        key: addKey,
        value: addValue.trim(),
        confidence: 1.0,
        source: 'manual',
        verifiedByUser: true,
      });

      setShowAddModal(false);
      setAddKey('');
      setAddValue('');
      if (onProfileUpdated) onProfileUpdated();
      setStatusMessage(`Saved "${addKey}" to local vault.`);
      executeDecisionPlan(true);
    } catch (err: any) {
      alert(`Failed to save: ${err?.message || err}`);
    }
  };

  // Calculate items ready for ACT
  const readyItems = useMemo(() => {
    return planItems.filter((item) => {
      if (item.status === 'skipped' || item.status === 'unmapped') return false;
      if (!item.targetValue) return false;
      if (item.status === 'ready') return true;
      if (item.status === 'needs-review' && confirmedLowConfFields[item.field.id]) return true;
      return false;
    });
  }, [planItems, confirmedLowConfFields]);

  const handleApprovePlan = () => {
    onPlanApproved(readyItems);
  };

  const getStatusBadge = (item: DecisionPlanItem) => {
    const isConfirmed = confirmedLowConfFields[item.field.id];

    switch (item.status) {
      case 'ready':
        return (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 flex items-center space-x-1">
            <CheckCircle2 className="w-2.5 h-2.5" />
            <span>Ready</span>
          </span>
        );
      case 'needs-review':
        return (
          <span
            className={`px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center space-x-1 ${
              isConfirmed ? 'bg-indigo-100 text-indigo-800' : 'bg-amber-100 text-amber-800'
            }`}
          >
            <AlertTriangle className="w-2.5 h-2.5" />
            <span>{isConfirmed ? 'Confirmed' : 'Needs Review (<0.75)'}</span>
          </span>
        );
      case 'missing-data':
        return (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-800 flex items-center space-x-1">
            <AlertCircle className="w-2.5 h-2.5" />
            <span>Missing Data</span>
          </span>
        );
      case 'unmapped':
        return (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-slate-100 text-slate-500">
            Not Mapped
          </span>
        );
      case 'skipped':
        return (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-slate-100 text-slate-600">
            Preserved
          </span>
        );
    }
  };

  return (
    <div className="space-y-3">
      {/* Top Banner & Control Deck */}
      <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-2xs space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center font-bold">
              <Sparkles className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                <span>AI Decision Engine (M5)</span>
                {fromCache && (
                  <span className="px-1.5 py-0.2 bg-purple-100 text-purple-800 rounded font-mono text-[9px] flex items-center space-x-1">
                    <Database className="w-2.5 h-2.5" />
                    <span>Cached</span>
                  </span>
                )}
              </h2>
              <p className="text-[10px] text-slate-500">
                Maps fields locally & with background LLM. Zero profile values sent.
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
              {readyItems.length}/{fields.length} Ready
            </span>
          </div>
        </div>

        {/* Rule 1 Privacy Guarantee */}
        <div className="p-2 bg-emerald-50/80 border border-emerald-200 rounded text-emerald-900 text-[10px] flex items-start space-x-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.2" />
          <div className="leading-tight">
            <span className="font-semibold">Rule 1 Hard Privacy Invariant:</span>
            <span className="text-emerald-800 ml-1">
              Field labels and key names only. Personal credentials never leave this machine.
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2 pt-1">
          <button
            onClick={() => executeDecisionPlan(true)}
            disabled={loading || fields.length === 0}
            className="flex-1 py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-xs font-semibold shadow-2xs flex items-center justify-center space-x-1.5 transition disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Analyzing Decision Plan...</span>
              </>
            ) : (
              <>
                <Wand2 className="w-3.5 h-3.5" />
                <span>Re-Analyze Form</span>
              </>
            )}
          </button>

          <button
            onClick={handleClearCache}
            disabled={loading}
            title="Clear form mapping cache in Dexie"
            className="py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-medium border border-slate-300 flex items-center space-x-1 transition disabled:opacity-50 cursor-pointer"
          >
            <Trash2 className="w-3 h-3 text-slate-500" />
            <span>Clear Cache</span>
          </button>
        </div>

        {/* Status Line */}
        {statusMessage && (
          <div className="text-[10px] text-slate-600 font-mono truncate">
            {statusMessage}
          </div>
        )}
        {errorMessage && (
          <div className="p-2 bg-red-50 border border-red-200 rounded text-red-800 text-[10px] flex items-center space-x-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
            <span className="truncate">{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Pre-Fill Checklist (M8 Validation Verification) */}
      {fields.length > 0 && (
        <PreFillChecklistCard
          fields={fields}
          plan={planItems}
          profileRecords={profileRecords}
          storedDocuments={storedDocs}
          onOpenProfileTab={onUnlockVaultRequested}
          onManualAddRequested={(key) => {
            setAddKey(key || '');
            setShowAddModal(true);
          }}
        />
      )}

      {/* Missing Information Section (Requirement 7) */}
      {missingKeys.length > 0 && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg space-y-2 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-rose-900 flex items-center space-x-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
              <span>Missing Information ({missingKeys.length})</span>
            </span>
            <span className="text-[9px] font-mono text-rose-700">Needed by this form</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {missingKeys.map((key) => (
              <div
                key={key}
                className="px-2 py-1 bg-white border border-rose-200 rounded text-[10px] text-rose-800 flex items-center space-x-1.5"
              >
                <span className="font-mono font-medium">{key}</span>
                <button
                  onClick={() => {
                    setAddKey(key);
                    setShowAddModal(true);
                  }}
                  className="text-rose-600 hover:text-rose-900 font-bold ml-1 cursor-pointer"
                  title={`Add value for ${key}`}
                >
                  + Add
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vault Locked Warning */}
      {!isVaultUnlocked && (
        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 flex items-center justify-between text-xs shadow-2xs">
          <div className="flex items-center space-x-2">
            <Lock className="w-4 h-4 text-amber-600 shrink-0" />
            <div>
              <span className="font-semibold block text-[11px]">Vault Locked</span>
              <span className="text-[10px] text-amber-700">Unlock your vault in Profile tab to resolve personal values.</span>
            </div>
          </div>
          <button
            onClick={onUnlockVaultRequested}
            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-semibold text-[10px] transition cursor-pointer"
          >
            Unlock Vault
          </button>
        </div>
      )}

      {/* Field Review Matrix */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-bold text-slate-700 flex items-center space-x-1">
            <Sliders className="w-3.5 h-3.5 text-indigo-600" />
            <span>Field Decision Matrix ({planItems.length})</span>
          </span>
          <span className="text-[10px] text-slate-500 font-mono">
            {readyItems.length} ready to fill
          </span>
        </div>

        {planItems.length === 0 ? (
          <div className="bg-white rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-500">
            <Layers className="w-8 h-8 mx-auto text-slate-400 mb-2 stroke-1" />
            <p className="font-medium text-slate-700">No form inputs detected</p>
            <p className="text-[10px] text-slate-500 mt-1">Open a web form tab to analyze mappings.</p>
          </div>
        ) : (
          planItems.map((item) => {
            const isConfirmed = confirmedLowConfFields[item.field.id];
            const isLowConfidence = item.confidence < 0.75 && item.profileKey && !item.isManualOverride;

            return (
              <div
                key={item.field.id}
                onMouseEnter={() => onPreviewField && onPreviewField(item.field)}
                className={`p-2.5 bg-white rounded-lg border shadow-2xs transition space-y-2 ${
                  isLowConfidence && !isConfirmed
                    ? 'border-amber-300 bg-amber-50/20'
                    : item.field.isInsideIframe
                    ? 'border-purple-200 bg-purple-50/10'
                    : 'border-slate-200 hover:border-indigo-300'
                }`}
              >
                {/* Header: Label, Type, Status */}
                <div className="flex items-start justify-between gap-1">
                  <div>
                    <div className="font-semibold text-[11px] text-slate-800 flex items-center space-x-1">
                      <span>{item.field.label}</span>
                      {item.field.required && <span className="text-red-500 font-bold">*</span>}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 truncate max-w-[200px]">
                      name: {item.field.name}
                    </div>
                  </div>

                  <div className="flex items-center space-x-1 shrink-0">
                    {item.field.isInsideIframe && (
                      <span className="px-1.5 py-0.2 rounded text-[8px] font-semibold bg-purple-100 text-purple-700 border border-purple-200">
                        iframe
                      </span>
                    )}
                    {getStatusBadge(item)}
                  </div>
                </div>

                {/* Profile Key Dropdown & Confidence */}
                <div className="grid grid-cols-12 gap-1.5 items-center">
                  <div className="col-span-8">
                    <label className="text-[9px] font-bold text-slate-500 block uppercase mb-0.5">
                      Mapped Profile Key:
                    </label>
                    <div className="relative">
                      <select
                        value={item.profileKey || '__NONE__'}
                        onChange={(e) => handleKeyOverride(item.field.id, e.target.value)}
                        className={`w-full text-[11px] px-2 py-1 pr-6 rounded border font-mono bg-white appearance-none cursor-pointer focus:ring-1 focus:ring-indigo-500 ${
                          item.isManualOverride
                            ? 'border-indigo-400 bg-indigo-50/20 text-indigo-900 font-semibold'
                            : item.profileKey
                            ? 'border-slate-300 text-slate-800'
                            : 'border-slate-200 text-slate-400'
                        }`}
                      >
                        <option value="__NONE__">-- Do not fill (Skip) --</option>
                        {candidateKeys.map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1.5 top-2 pointer-events-none" />
                    </div>
                  </div>

                  {/* Confidence Badge */}
                  <div className="col-span-4 text-right">
                    <label className="text-[9px] font-bold text-slate-500 block uppercase mb-0.5">
                      Confidence:
                    </label>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono ${
                        item.confidence >= 0.85
                          ? 'bg-emerald-100 text-emerald-800'
                          : item.confidence >= 0.75
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {Math.round(item.confidence * 100)}%
                    </span>
                  </div>
                </div>

                {/* Value Preview & Reasoning */}
                <div className="p-2 bg-slate-50 rounded border border-slate-200 text-[10px] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Value to fill:</span>
                    {item.targetValue ? (
                      <span className="font-mono font-bold text-emerald-700 truncate max-w-[180px]">
                        {item.targetValue}
                      </span>
                    ) : item.profileKey ? (
                      <span className="text-rose-600 font-semibold">Missing from profile</span>
                    ) : (
                      <span className="text-slate-400 italic">None</span>
                    )}
                  </div>

                  <div className="text-[10px] text-slate-500 flex items-start space-x-1 pt-0.5 border-t border-slate-200/60">
                    <Info className="w-3 h-3 text-slate-400 mt-0.5 shrink-0" />
                    <span className="italic truncate">{item.reason}</span>
                  </div>
                </div>

                {/* Requirement 8: Confirmation Gate for < 0.75 confidence fields */}
                {isLowConfidence && (
                  <div className="p-2 bg-amber-50 border border-amber-200 rounded text-[10px] flex items-center justify-between text-amber-900">
                    <div className="flex items-center space-x-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Low confidence (&lt;75%). Confirm to fill.</span>
                    </div>
                    <button
                      onClick={() => toggleConfirmField(item.field.id)}
                      className={`px-2 py-0.5 rounded text-[9px] font-semibold transition cursor-pointer ${
                        isConfirmed
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white border border-amber-300 text-amber-800 hover:bg-amber-100'
                      }`}
                    >
                      {isConfirmed ? '✓ Confirmed' : 'Confirm'}
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Bottom CTA: Approve & Proceed to Act */}
      {fields.length > 0 && (
        <div className="sticky bottom-0 pt-2 pb-1 bg-slate-50 border-t border-slate-200 flex items-center space-x-2">
          <button
            onClick={handleApprovePlan}
            disabled={readyItems.length === 0}
            className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-md flex items-center justify-center space-x-2 transition disabled:opacity-50 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Approve Plan & Proceed to Act ({readyItems.length} fields)</span>
          </button>
        </div>
      )}

      {/* Quick Add Profile Detail Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-sm w-full p-4 space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="font-bold text-xs text-slate-800 flex items-center space-x-1.5">
                <PlusCircle className="w-3.5 h-3.5 text-indigo-600" />
                <span>Add Profile Detail</span>
              </span>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleQuickAdd} className="space-y-2.5 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Profile Key:
                </label>
                <input
                  type="text"
                  value={addKey}
                  readOnly
                  className="w-full px-2.5 py-1.5 rounded border border-slate-200 bg-slate-50 font-mono text-slate-700 font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Value:
                </label>
                <input
                  type="text"
                  autoFocus
                  value={addValue}
                  onChange={(e) => setAddValue(e.target.value)}
                  placeholder={`Enter value for ${addKey}...`}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 font-mono text-slate-900 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!addValue.trim()}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold disabled:opacity-50"
                >
                  Save & Bind
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

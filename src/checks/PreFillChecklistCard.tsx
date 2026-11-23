import React, { useState, useMemo } from 'react';
import { FormField } from '../types';
import { ProfileRecord, StoredDocument } from '../types/profile';
import { DecisionPlanItem } from '../decide/decisionEngine';
import { runPreFillChecklist, PreFillChecklistResult, PreFillIssue } from './preFillChecklist';
import {
  ShieldAlert,
  AlertTriangle,
  Info,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Wrench,
} from 'lucide-react';

interface PreFillChecklistCardProps {
  fields: FormField[];
  plan?: DecisionPlanItem[];
  profileRecords?: ProfileRecord[];
  storedDocuments?: Array<Omit<StoredDocument, 'encryptedBlob'>>;
  onOpenProfileTab?: () => void;
  onManualAddRequested?: (keyName?: string) => void;
}

export const PreFillChecklistCard: React.FC<PreFillChecklistCardProps> = ({
  fields,
  plan = [],
  profileRecords = [],
  storedDocuments = [],
  onOpenProfileTab,
  onManualAddRequested,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  const checklist: PreFillChecklistResult = useMemo(() => {
    return runPreFillChecklist(fields, plan, profileRecords, storedDocuments);
  }, [fields, plan, profileRecords, storedDocuments]);

  if (checklist.issues.length === 0) {
    return (
      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <div>
            <div className="font-semibold">Pre-Fill Verification Passed</div>
            <div className="text-[10px] text-emerald-700">
              All documents, profile values, and cross-document credentials match.
            </div>
          </div>
        </div>
        <span className="text-[10px] bg-emerald-200/60 font-semibold px-2 py-0.5 rounded text-emerald-800">
          Clean
        </span>
      </div>
    );
  }

  const errorIssues = checklist.issues.filter((i) => i.severity === 'error');
  const warningIssues = checklist.issues.filter((i) => i.severity === 'warning');
  const infoIssues = checklist.issues.filter((i) => i.severity === 'info');

  return (
    <div className="border border-amber-200 bg-amber-50/40 rounded-lg overflow-hidden text-xs shadow-2xs">
      {/* Header Banner */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="px-3 py-2.5 bg-gradient-to-r from-amber-100/90 to-amber-50 border-b border-amber-200 flex items-center justify-between cursor-pointer select-none"
      >
        <div className="flex items-center space-x-2">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
          <div>
            <span className="font-bold text-slate-800">Pre-Fill Checklist</span>
            <span className="text-[10px] text-slate-600 ml-2">
              ({checklist.issues.length} {checklist.issues.length === 1 ? 'issue' : 'issues'} detected)
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-1.5">
          {errorIssues.length > 0 && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">
              {errorIssues.length} Error{errorIssues.length > 1 ? 's' : ''}
            </span>
          )}
          {warningIssues.length > 0 && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
              {warningIssues.length} Warning{warningIssues.length > 1 ? 's' : ''}
            </span>
          )}
          {infoIssues.length > 0 && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
              {infoIssues.length} Info
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-slate-500 ml-1" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-slate-500 ml-1" />
          )}
        </div>
      </div>

      {/* Issues List */}
      {isExpanded && (
        <div className="p-2.5 space-y-2 bg-white max-h-72 overflow-y-auto">
          {checklist.issues.map((issue: PreFillIssue) => {
            const isError = issue.severity === 'error';
            const isWarning = issue.severity === 'warning';

            return (
              <div
                key={issue.id}
                className={`p-2.5 rounded-md border text-xs ${
                  isError
                    ? 'border-red-200 bg-red-50/40 text-red-900'
                    : isWarning
                    ? 'border-amber-200 bg-amber-50/30 text-amber-900'
                    : 'border-blue-200 bg-blue-50/30 text-blue-900'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 flex-1">
                    <div className="font-semibold flex items-center space-x-1.5">
                      {isError ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                      ) : isWarning ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      ) : (
                        <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      )}
                      <span>{issue.title}</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      {issue.description}
                    </p>
                    <div className="text-[10px] text-slate-700 bg-white/80 p-1.5 rounded border border-slate-200/60 mt-1 flex items-start space-x-1.5">
                      <Wrench className="w-3 h-3 text-slate-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-slate-800">Suggested Fix: </span>
                        <span>{issue.suggestedFix}</span>
                      </div>
                    </div>
                  </div>

                  {/* Quick Action Button */}
                  <div className="shrink-0 self-start">
                    {issue.category === 'missing-document' || issue.category === 'expired-document' ? (
                      <button
                        onClick={onOpenProfileTab}
                        className="px-2 py-1 bg-white border border-slate-300 hover:bg-slate-50 text-[10px] font-semibold rounded text-slate-700 flex items-center space-x-1 shadow-2xs"
                      >
                        <span>Upload</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </button>
                    ) : issue.category === 'missing-value' ? (
                      <button
                        onClick={() => onManualAddRequested?.(issue.fieldId)}
                        className="px-2 py-1 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-[10px] font-semibold rounded text-indigo-700 flex items-center space-x-1 shadow-2xs"
                      >
                        <span>Add</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

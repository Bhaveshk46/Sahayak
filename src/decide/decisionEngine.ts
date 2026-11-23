import { FormField } from '../types';
import { ProfileRecord, DocumentType } from '../types/profile';
import { computeFormSignature } from './formSignature';
import { matchFieldHeuristically, matchFileSlot } from './heuristicMatcher';
import { formatValueForField } from './valueFormatter';
import { getCachedMapping, setCachedMapping } from '../storage/db';
import { GeminiProvider } from '../llm/gemini';
import { ClaudeProvider } from '../llm/claude';

export type DecisionStatus = 'ready' | 'needs-review' | 'missing-data' | 'unmapped' | 'skipped';

export interface DecisionPlanItem {
  field: FormField;
  profileKey: string | null;
  targetValue: string;
  rawValue?: string;
  confidence: number;
  reason: string;
  status: DecisionStatus;
  isManualOverride: boolean;
  candidateDocumentId?: string;
  candidateDocumentType?: DocumentType;
}

export interface DecisionPlanResult {
  formSignature: string;
  items: DecisionPlanItem[];
  missingProfileKeys: string[];
  fromCache: boolean;
  llmInvoked: boolean;
  llmFieldsCount: number;
}

export interface RunDecisionEngineOptions {
  fields: FormField[];
  urlOrOrigin: string;
  profileRecords: ProfileRecord[];
  storedDocuments?: Array<{ id: string; name: string; type: DocumentType }>;
  apiConfig?: {
    provider?: 'gemini' | 'claude';
    geminiApiKey?: string;
    claudeApiKey?: string;
    geminiModel?: string;
    claudeModel?: string;
  };
  forceFresh?: boolean;
  manualOverrides?: Record<string, string | null>;
  fetchFn?: typeof fetch;
}

/**
 * Executes FormPilot's OBSERVE -> DECIDE stage:
 * 1. Checks Dexie mappingCache by form signature.
 * 2. Runs fast local heuristic matcher first (confidence >= 0.85).
 * 3. Only sends fields with confidence < 0.85 to the background LLM (never values).
 * 4. Formats values locally (dates, phone numbers, option aliases, numbers).
 * 5. Maps file slots to candidate documents without auto-attaching.
 * 6. Flags fields < 0.75 as needs-review.
 */
export async function runDecisionEngine({
  fields,
  urlOrOrigin,
  profileRecords,
  storedDocuments = [],
  apiConfig,
  forceFresh = false,
  manualOverrides = {},
  fetchFn = fetch,
}: RunDecisionEngineOptions): Promise<DecisionPlanResult> {
  const formSignature = computeFormSignature(urlOrOrigin, fields);

  // Fast profile record lookup
  const profileMap = new Map<string, ProfileRecord>();
  for (const r of profileRecords) {
    profileMap.set(r.key, r);
  }

  // 1. Check Dexie Cache
  let cachedMappings: Map<string, { profileKey: string | null; confidence: number; reason: string; isManualOverride?: boolean }> | null = null;
  if (!forceFresh) {
    const cached = await getCachedMapping(formSignature);
    if (cached && cached.mappings.length > 0) {
      cachedMappings = new Map();
      for (const m of cached.mappings) {
        cachedMappings.set(m.fieldId, m);
      }
    }
  }

  // 2. Compute Initial Mapping per field
  const workingDecisions = new Map<
    string,
    { profileKey: string | null; confidence: number; reason: string; isManualOverride: boolean }
  >();

  const fieldsNeedingLLM: FormField[] = [];

  for (const field of fields) {
    // Check manual override first
    if (manualOverrides[field.id] !== undefined) {
      const chosen = manualOverrides[field.id];
      workingDecisions.set(field.id, {
        profileKey: chosen,
        confidence: chosen ? 1.0 : 0.0,
        reason: chosen ? `User manual override to ${chosen}` : 'User selected: Do not fill',
        isManualOverride: true,
      });
      continue;
    }

    // Check cached mapping
    if (cachedMappings && cachedMappings.has(field.id)) {
      const c = cachedMappings.get(field.id)!;
      workingDecisions.set(field.id, {
        profileKey: c.profileKey,
        confidence: c.confidence,
        reason: `${c.reason} (from cache)`,
        isManualOverride: c.isManualOverride || false,
      });
      continue;
    }

    // Run Heuristic Matcher
    const heuristic = matchFieldHeuristically(field);
    workingDecisions.set(field.id, {
      profileKey: heuristic.profileKey,
      confidence: heuristic.confidence,
      reason: heuristic.reason,
      isManualOverride: false,
    });

    // Requirement 3: Only fields under 0.85 go to the LLM!
    const isCaptcha =
      field.name.toLowerCase().includes('captcha') || field.id.toLowerCase().includes('captcha');
    const isFile = field.type === 'file' || field.type === 'dropzone';

    if (!isCaptcha && !isFile && heuristic.confidence < 0.85) {
      fieldsNeedingLLM.push(field);
    }
  }

  // 3. Selective LLM Invocation for fields < 0.85
  let llmInvoked = false;
  let llmFieldsCount = 0;

  if (fieldsNeedingLLM.length > 0 && apiConfig) {
    const provider = apiConfig.provider || 'gemini';
    const apiKey = (provider === 'gemini' ? apiConfig.geminiApiKey : apiConfig.claudeApiKey) || '';

    if (apiKey.trim()) {
      llmInvoked = true;
      llmFieldsCount = fieldsNeedingLLM.length;

      try {
        const llm =
          provider === 'gemini'
            ? new GeminiProvider(apiKey, apiConfig.geminiModel || 'gemini-2.5-flash', fetchFn)
            : new ClaudeProvider(apiKey, apiConfig.claudeModel || 'claude-3-5-sonnet-20241022', fetchFn);

        // Strict Requirement 1: pass ONLY field metadata, NO profile values!
        const llmInput = fieldsNeedingLLM.map((f) => ({
          id: f.id,
          label: f.label,
          type: f.type,
          options: f.options?.map((o) => o.label || o.value),
          hint: f.hint,
          placeholder: f.placeholder,
          required: f.required,
          accept: f.accept,
        }));

        const result = await llm.executeMapping(llmInput);

        // Apply LLM results
        for (const m of result.mappings) {
          workingDecisions.set(m.fieldId, {
            profileKey: m.profileKey,
            confidence: m.confidence,
            reason: `LLM (${provider}): ${m.reason}`,
            isManualOverride: false,
          });
        }
      } catch (err) {
        console.warn('[DecisionEngine] LLM mapping failed, retaining heuristic matches:', err);
      }
    }
  }

  // 4. Local Value Formatting, Status Calculation & File Slot Resolution
  const finalItems: DecisionPlanItem[] = [];
  const missingKeysSet = new Set<string>();

  for (const field of fields) {
    const decision = workingDecisions.get(field.id) || {
      profileKey: null,
      confidence: 0,
      reason: 'Unmapped',
      isManualOverride: false,
    };

    const isCaptcha =
      field.name.toLowerCase().includes('captcha') || field.id.toLowerCase().includes('captcha');
    const isFile = field.type === 'file' || field.type === 'dropzone';

    let targetValue = '';
    let rawValue = '';
    let status: DecisionStatus = 'ready';
    let finalReason = decision.reason;
    let candidateDocId: string | undefined = undefined;
    let candidateDocType: DocumentType | undefined = undefined;

    if (isCaptcha) {
      status = 'skipped';
      finalReason = 'Rule 2: CAPTCHA / OTP preserved for user handback';
    } else if (isFile) {
      status = 'skipped';
      const slotMatch = matchFileSlot(field);
      if (slotMatch) {
        candidateDocType = slotMatch.documentType;
        const matchingDoc = storedDocuments.find((d) => d.type === slotMatch.documentType);
        if (matchingDoc) {
          candidateDocId = matchingDoc.id;
          finalReason = `Candidate document: "${matchingDoc.name}" (${slotMatch.documentType})`;
        } else {
          finalReason = `Awaiting document upload of type: ${slotMatch.documentType}`;
        }
      }
    } else if (!decision.profileKey) {
      status = 'unmapped';
      finalReason = decision.reason || 'No profile key mapped';
    } else {
      const record = profileMap.get(decision.profileKey);
      if (!record || !record.value.trim()) {
        status = 'missing-data';
        finalReason = `Profile key "${decision.profileKey}" is empty in vault`;
        missingKeysSet.add(decision.profileKey);
      } else {
        rawValue = record.value;
        const formatted = formatValueForField(record.value, field, decision.profileKey);
        targetValue = formatted.formattedValue;

        if (formatted.needsReview) {
          status = 'needs-review';
          finalReason = formatted.reason || 'Value formatting requires user review';
        } else if (decision.confidence < 0.75 && !decision.isManualOverride) {
          // Requirement 8: Fields under 0.75 are highlighted and NOT filled until confirmed
          status = 'needs-review';
          finalReason = `Confidence (${Math.round(decision.confidence * 100)}%) is under 0.75 threshold`;
        } else {
          status = 'ready';
        }
      }
    }

    finalItems.push({
      field,
      profileKey: decision.profileKey,
      targetValue,
      rawValue,
      confidence: decision.confidence,
      reason: finalReason,
      status,
      isManualOverride: decision.isManualOverride,
      candidateDocumentId: candidateDocId,
      candidateDocumentType: candidateDocType,
    });
  }

  // 5. Cache the mappings in Dexie for this form signature
  try {
    let origin = 'unknown';
    try {
      origin = new URL(urlOrOrigin).origin;
    } catch {
      origin = urlOrOrigin;
    }

    const mappingsToCache = finalItems.map((item) => ({
      fieldId: item.field.id,
      profileKey: item.profileKey,
      confidence: item.confidence,
      reason: item.reason,
      isManualOverride: item.isManualOverride,
    }));

    await setCachedMapping(formSignature, origin, mappingsToCache);
  } catch (cacheErr) {
    console.warn('[DecisionEngine] Failed to save mapping cache:', cacheErr);
  }

  return {
    formSignature,
    items: finalItems,
    missingProfileKeys: Array.from(missingKeysSet),
    fromCache: cachedMappings !== null,
    llmInvoked,
    llmFieldsCount,
  };
}

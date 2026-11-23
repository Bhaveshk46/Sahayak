import { FormField } from '../types';
import { ProfileRecord, DocumentType } from '../types/profile';
import { DecisionPlanItem } from '../decide/decisionEngine';
import { inferExpectedDocumentType } from '../attach/documentRanker';
import { compareNames } from './nameMatcher';
import { checkDocumentExpiry, ExpiryConfig, DEFAULT_EXPIRY_CONFIG } from './expiryChecker';

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface PreFillIssue {
  id: string;
  category: 'missing-document' | 'missing-value' | 'expired-document' | 'name-mismatch' | 'dob-mismatch' | 'wrong-document';
  severity: IssueSeverity;
  title: string;
  description: string;
  suggestedFix: string;
  fieldId?: string;
  documentId?: string;
}

export interface PreFillChecklistResult {
  passed: boolean;
  issues: PreFillIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

/**
 * Normalizes date strings (e.g., DD/MM/YYYY vs DD-MM-YYYY vs YYYY-MM-DD) for uniform comparison.
 */
export function normalizeDate(dateStr: string): string {
  if (!dateStr) return '';
  const clean = dateStr.trim().replace(/[/.]/g, '-');

  // If YYYY-MM-DD
  const ymd = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymd) {
    const y = ymd[1];
    const m = ymd[2].padStart(2, '0');
    const d = ymd[3].padStart(2, '0');
    return `${d}-${m}-${y}`;
  }

  // If DD-MM-YYYY
  const dmy = clean.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmy) {
    const d = dmy[1].padStart(2, '0');
    const m = dmy[2].padStart(2, '0');
    const y = dmy[3];
    return `${d}-${m}-${y}`;
  }

  return clean;
}

/**
 * Runs pre-fill validation checks strictly on-device using local vault data.
 * Rule 1: No profile values ever go to an LLM.
 */
export function runPreFillChecklist(
  fields: FormField[],
  plan: DecisionPlanItem[] = [],
  profileRecords: ProfileRecord[] = [],
  storedDocuments: Array<{ id: string; name: string; type: DocumentType; addedAt?: number; tags?: string[] }> = [],
  config: ExpiryConfig = DEFAULT_EXPIRY_CONFIG
): PreFillChecklistResult {
  const issues: PreFillIssue[] = [];

  const planMap = new Map<string, DecisionPlanItem>();
  plan.forEach((p) => planMap.set(p.field.id, p));

  const profileMap = new Map<string, string>();
  profileRecords.forEach((r) => profileMap.set(r.key, r.value));

  // 1. Missing Upload Documents Check
  const uploadSlots = fields.filter(
    (f) => f.type === 'file' || f.type === 'dropzone' || f.name.toLowerCase().includes('document') || f.name.toLowerCase().includes('upload')
  );

  for (const slot of uploadSlots) {
    const { type: expectedType, confidence } = inferExpectedDocumentType(slot.label, slot.hint);
    if (expectedType !== 'other' && confidence >= 0.7) {
      const candidate = storedDocuments.find((d) => d.type === expectedType);
      if (!candidate) {
        issues.push({
          id: `missing_doc_${slot.id}`,
          category: 'missing-document',
          severity: slot.required ? 'error' : 'warning',
          title: `Missing Document: ${expectedType.replace(/_/g, ' ').toUpperCase()}`,
          description: `Upload slot "${slot.label}" requires a ${expectedType.replace(/_/g, ' ')}, but no matching document was found in your vault.`,
          suggestedFix: `Upload your ${expectedType.replace(/_/g, ' ')} in the Profile tab.`,
          fieldId: slot.id,
        });
      }
    }
  }

  // 2. Missing Profile Values for Required Fields
  for (const field of fields) {
    if (!field.required) continue;
    if (field.type === 'file' || field.type === 'dropzone') continue;
    if (field.name.toLowerCase().includes('captcha') || field.id.toLowerCase().includes('captcha')) continue;

    const planned = planMap.get(field.id);
    const value = planned?.targetValue || (planned?.profileKey ? profileMap.get(planned.profileKey) : undefined);

    if (!value || !value.trim()) {
      issues.push({
        id: `missing_val_${field.id}`,
        category: 'missing-value',
        severity: 'error',
        title: `Missing Required Value: ${field.label}`,
        description: `Field "${field.label}" is mandatory on the portal, but no matching value exists in your profile.`,
        suggestedFix: `Add a value for "${field.label}" in the Profile tab or enter it manually before submitting.`,
        fieldId: field.id,
      });
    }
  }

  // 3. Expired / Stale Document Checks
  for (const doc of storedDocuments) {
    const expiry = checkDocumentExpiry(doc, config);
    if (expiry.isExpired) {
      issues.push({
        id: `expired_doc_${doc.id}`,
        category: 'expired-document',
        severity: 'warning',
        title: `Stale Certificate: ${doc.name}`,
        description: expiry.reason,
        suggestedFix: `Upload a fresh ${doc.type.replace(/_/g, ' ')} issued for the current financial year.`,
        documentId: doc.id,
      });
    }
  }

  // 4. Name Mismatches Across Documents
  // Collect names from profile records with different source documents
  const nameRecords = profileRecords.filter((r) => r.key === 'fullName' && r.value.trim());
  if (nameRecords.length >= 2) {
    for (let i = 0; i < nameRecords.length - 1; i++) {
      for (let j = i + 1; j < nameRecords.length; j++) {
        const nameA = nameRecords[i].value;
        const nameB = nameRecords[j].value;
        const comp = compareNames(nameA, nameB);

        if (!comp.match) {
          issues.push({
            id: `name_mismatch_${i}_${j}`,
            category: 'name-mismatch',
            severity: 'error',
            title: 'Name Discrepancy Across Documents',
            description: `Name "${nameA}" (from ${nameRecords[i].sourceDocName || 'source A'}) differs from "${nameB}" (from ${nameRecords[j].sourceDocName || 'source B'}): ${comp.reason}.`,
            suggestedFix: 'Ensure all documents belong to the same applicant, or prepare a gazette/affidavit explaining name variation.',
          });
        } else if (comp.isInitialsMatch) {
          issues.push({
            id: `name_initials_${i}_${j}`,
            category: 'name-mismatch',
            severity: 'info',
            title: 'Name Initials Variation',
            description: `"${nameA}" matches "${nameB}" with initials variation.`,
            suggestedFix: 'Verify portal guidelines on whether initials or expanded legal names are required.',
          });
        }
      }
    }
  }

  // 5. DOB Mismatches Across Documents
  const dobRecords = profileRecords.filter(
    (r) => (r.key === 'dob' || r.key === 'dateOfBirth' || r.key.toLowerCase().includes('dob')) && r.value.trim()
  );
  if (dobRecords.length >= 2) {
    for (let i = 0; i < dobRecords.length - 1; i++) {
      for (let j = i + 1; j < dobRecords.length; j++) {
        const dobA = normalizeDate(dobRecords[i].value);
        const dobB = normalizeDate(dobRecords[j].value);

        if (dobA && dobB && dobA !== dobB) {
          issues.push({
            id: `dob_mismatch_${i}_${j}`,
            category: 'dob-mismatch',
            severity: 'error',
            title: 'Date of Birth Mismatch Across Documents',
            description: `DOB in ${dobRecords[i].sourceDocName || 'Doc A'} (${dobA}) does not match DOB in ${dobRecords[j].sourceDocName || 'Doc B'} (${dobB}).`,
            suggestedFix: 'Indian portals strictly verify date of birth against the Class 10th Marksheet/Passing Certificate. Use the 10th Marksheet DOB.',
          });
        }
      }
    }
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const infoCount = issues.filter((i) => i.severity === 'info').length;

  return {
    passed: errorCount === 0,
    issues,
    errorCount,
    warningCount,
    infoCount,
  };
}


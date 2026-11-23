import { FormField } from '../types';

export interface FormattedValueResult {
  formattedValue: string;
  needsReview: boolean;
  reason?: string;
  wasTransformed?: boolean;
}

/**
 * Parses a variety of input date formats into year, month, and day.
 */
export function parseDate(rawDateStr: string): { year: number; month: number; day: number } | null {
  if (!rawDateStr) return null;
  const clean = rawDateStr.trim();

  // 1. ISO YYYY-MM-DD
  const isoMatch = clean.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    if (year > 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year, month, day };
    }
  }

  // 2. Indian DD/MM/YYYY or DD-MM-YYYY
  const inMatch = clean.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (inMatch) {
    const day = parseInt(inMatch[1], 10);
    const month = parseInt(inMatch[2], 10);
    const year = parseInt(inMatch[3], 10);
    if (year > 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year, month, day };
    }
  }

  // 3. Fallback to JavaScript Date parse
  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) {
    return {
      year: parsed.getFullYear(),
      month: parsed.getMonth() + 1,
      day: parsed.getDate(),
    };
  }

  return null;
}

/**
 * Formats date values according to HTML5 <input type="date"> (YYYY-MM-DD)
 * or text inputs specifying DD/MM/YYYY or DD-MM-YYYY in placeholder/pattern.
 */
export function formatDateValue(rawDate: string, field: FormField): { value: string; formatted: boolean } {
  const parsed = parseDate(rawDate);
  if (!parsed) return { value: rawDate, formatted: false };

  const yyyy = String(parsed.year);
  const mm = String(parsed.month).padStart(2, '0');
  const dd = String(parsed.day).padStart(2, '0');

  // HTML5 input type="date" strictly requires YYYY-MM-DD
  if (field.type === 'date') {
    return { value: `${yyyy}-${mm}-${dd}`, formatted: true };
  }

  const hint = `${field.placeholder || ''} ${field.hint || ''} ${field.pattern || ''}`.toLowerCase();

  if (hint.includes('yyyy-mm-dd') || hint.includes('yyyy/mm/dd')) {
    return { value: `${yyyy}-${mm}-${dd}`, formatted: true };
  }

  if (hint.includes('dd-mm-yyyy')) {
    return { value: `${dd}-${mm}-${yyyy}`, formatted: true };
  }

  // Default text date representation for Indian forms is DD/MM/YYYY
  return { value: `${dd}/${mm}/${yyyy}`, formatted: true };
}

/**
 * Formats Indian phone numbers to 10 digits or +91 prefixes based on field requirements.
 */
export function formatPhoneValue(rawPhone: string, field: FormField): { value: string; formatted: boolean } {
  if (!rawPhone) return { value: '', formatted: false };

  const digits = rawPhone.replace(/\D/g, '');
  let tenDigits = digits;

  // If starts with 91 and has 12 digits, strip country code
  if (digits.length === 12 && digits.startsWith('91')) {
    tenDigits = digits.slice(2);
  } else if (digits.length > 10) {
    tenDigits = digits.slice(-10);
  }

  const hint = `${field.placeholder || ''} ${field.label || ''} ${field.pattern || ''}`.toLowerCase();

  // If input explicitly expects +91 prefix
  if (hint.includes('+91') || (field.maxLength && field.maxLength >= 13)) {
    return { value: `+91${tenDigits}`, formatted: true };
  }

  return { value: tenDigits, formatted: digits !== tenDigits };
}

/**
 * Matches a profile value to one of the field's <select> or radio options.
 * Handles abbreviations (OBC, SC, ST, EWS), case discrepancies, and partial titles.
 */
export function matchOptionValue(
  profileValue: string,
  options?: Array<{ label: string; value: string }>
): { value: string; needsReview: boolean; reason?: string } {
  if (!options || options.length === 0) {
    return { value: profileValue, needsReview: false };
  }

  const normTarget = profileValue.trim().toLowerCase();

  // 1. Exact match on option.value
  const exactValue = options.find((o) => o.value.trim().toLowerCase() === normTarget);
  if (exactValue) {
    return { value: exactValue.value, needsReview: false };
  }

  // 2. Exact match on option.label
  const exactLabel = options.find((o) => o.label.trim().toLowerCase() === normTarget);
  if (exactLabel) {
    return { value: exactLabel.value, needsReview: false };
  }

  // 3. Category / Reservation abbreviations (OBC, SC, ST, GEN, EWS)
  const categoryAliases: Record<string, string[]> = {
    obc: ['other backward class', 'other backward classes', 'obc', 'o.b.c'],
    sc: ['scheduled caste', 'scheduled castes', 'sc', 's.c'],
    st: ['scheduled tribe', 'scheduled tribes', 'st', 's.t'],
    ews: ['economically weaker section', 'ews', 'e.w.s'],
    general: ['general', 'open', 'gen', 'unreserved', 'ur'],
  };

  for (const [, aliases] of Object.entries(categoryAliases)) {
    if (aliases.some((a) => normTarget.includes(a))) {
      const match = options.find((o) => {
        const oNorm = `${o.label} ${o.value}`.toLowerCase();
        return aliases.some((a) => oNorm.includes(a));
      });
      if (match) {
        return { value: match.value, needsReview: false };
      }
    }
  }

  // 4. Gender abbreviations (M, F, O)
  const genderAliases: Record<string, string[]> = {
    female: ['female', 'f', 'woman', 'girl', 'महिला', 'स्त्री'],
    male: ['male', 'm', 'man', 'boy', 'पुरुष'],
    other: ['other', 'transgender', 't', 'इतर', 'अन्य'],
  };

  for (const [, aliases] of Object.entries(genderAliases)) {
    if (aliases.includes(normTarget)) {
      const match = options.find((o) => {
        const oNorm = `${o.label} ${o.value}`.toLowerCase();
        return aliases.some((a) => oNorm === a || oNorm.startsWith(a));
      });
      if (match) {
        return { value: match.value, needsReview: false };
      }
    }
  }

  // 5. Bank Account Types (Savings, Current)
  if (normTarget.includes('saving')) {
    const match = options.find((o) => `${o.label} ${o.value}`.toLowerCase().includes('saving'));
    if (match) return { value: match.value, needsReview: false };
  }
  if (normTarget.includes('current')) {
    const match = options.find((o) => `${o.label} ${o.value}`.toLowerCase().includes('current'));
    if (match) return { value: match.value, needsReview: false };
  }

  // 6. Substring match
  const subMatch = options.find((o) => {
    const oText = `${o.label} ${o.value}`.toLowerCase();
    return oText.includes(normTarget) || normTarget.includes(o.value.toLowerCase());
  });

  if (subMatch) {
    return { value: subMatch.value, needsReview: false };
  }

  // No option matched - trigger needsReview
  return {
    value: profileValue,
    needsReview: true,
    reason: `Profile value "${profileValue}" does not match any available option in dropdown`,
  };
}

/**
 * Cleans numerical inputs by removing commas, currency symbols, and percentages.
 */
export function formatNumberValue(rawValue: string, _field?: FormField): { value: string; formatted: boolean } {
  if (!rawValue) return { value: '', formatted: false };

  // Remove currency signs (₹, Rs, INR) and commas
  const cleaned = rawValue.replace(/[₹$€£\s,]|inr|rs\.?/gi, '').trim();

  // If percentage input, remove % symbol
  const finalNum = cleaned.replace(/%/g, '').trim();

  return { value: finalNum, formatted: finalNum !== rawValue };
}

/**
 * Main coordinator function to locally format a profile value for a specific field.
 */
export function formatValueForField(
  profileValue: string,
  field: FormField,
  profileKey: string
): FormattedValueResult {
  if (!profileValue) {
    return { formattedValue: '', needsReview: false };
  }

  // Date fields
  if (profileKey === 'dob' || field.type === 'date') {
    const { value, formatted } = formatDateValue(profileValue, field);
    return { formattedValue: value, needsReview: false, wasTransformed: formatted };
  }

  // First Name and Last Name extraction from compound name
  if (profileKey === 'firstName') {
    const parts = profileValue.trim().split(/\s+/);
    const first = parts[0] || profileValue;
    return { formattedValue: first, needsReview: false, wasTransformed: first !== profileValue };
  }
  if (profileKey === 'lastName') {
    const parts = profileValue.trim().split(/\s+/);
    const last = parts.length > 1 ? parts[parts.length - 1] : profileValue;
    return { formattedValue: last, needsReview: false, wasTransformed: last !== profileValue };
  }

  // Phone / Mobile fields
  if (profileKey === 'mobile' || field.type === 'tel') {
    const { value, formatted } = formatPhoneValue(profileValue, field);
    return { formattedValue: value, needsReview: false, wasTransformed: formatted };
  }

  // Options (Select, Radio, Custom-select)
  if (field.type === 'select' || field.type === 'radio' || field.type === 'custom-select' || (field.options && field.options.length > 0)) {
    const { value, needsReview, reason } = matchOptionValue(profileValue, field.options);
    return { formattedValue: value, needsReview, reason, wasTransformed: value !== profileValue };
  }

  // Number fields
  if (field.type === 'number' || profileKey === 'annualIncome' || profileKey === 'marksPercent') {
    const { value, formatted } = formatNumberValue(profileValue, field);
    return { formattedValue: value, needsReview: false, wasTransformed: formatted };
  }

  return { formattedValue: profileValue, needsReview: false };
}

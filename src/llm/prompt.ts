import { LLMFieldInput, ProfileKeyDescriptor } from './schema';
import { PROFILE_KEY_SYNONYMS } from '../decide/heuristicMatcher';

export function getStandardProfileKeyDescriptors(): ProfileKeyDescriptor[] {
  return Object.entries(PROFILE_KEY_SYNONYMS).map(([key, data]) => ({
    key,
    description: data.description,
  }));
}

/**
 * Builds the strict Rule 1 prompt for the LLM.
 * HARD PRIVACY INVARIANT:
 * ONLY field metadata and profile key names with descriptions are included.
 * Never profile values, document contents, or file names.
 */
export function buildLLMMappingPrompt(
  fields: LLMFieldInput[],
  descriptors: ProfileKeyDescriptor[] = getStandardProfileKeyDescriptors()
): string {
  const sanitizedFields = fields.map((f) => ({
    id: f.id,
    label: f.label,
    type: f.type,
    options: f.options && f.options.length > 0 ? f.options.slice(0, 15) : undefined,
    hint: f.hint || undefined,
    placeholder: f.placeholder || undefined,
    required: f.required || undefined,
    accept: f.accept || undefined,
  }));

  return `You are FormPilot's AI Decision Engine for Indian web forms (scholarships, KYC, state recruitment, university portals).

TASK:
Map each scanned web form field to the most appropriate profile key from AVAILABLE_PROFILE_KEYS.

CRITICAL PRIVACY & SAFETY RULES:
1. You are given ONLY form field metadata and profile key definitions. Never guess or hallucinate user values.
2. If a field is a CAPTCHA, verification code, OTP, or submit button, set profileKey to null, confidence to 0.0, and reason to "Rule 2: CAPTCHA / OTP preserved for user handoff".
3. If no profile key applies, set profileKey to null and confidence to 0.0.
4. Any fields you cannot match must be listed in unmatchedFields.
5. Any profile keys needed by this form that are not matched must be listed in missingProfileKeys.

AVAILABLE_PROFILE_KEYS:
${JSON.stringify(descriptors, null, 2)}

FORM_FIELDS_TO_MAP:
${JSON.stringify(sanitizedFields, null, 2)}

OUTPUT FORMAT: Strict JSON matching this schema:
{
  "mappings": [
    {
      "fieldId": "exact_field_id_from_input",
      "profileKey": "key_or_null",
      "confidence": 0.95,
      "reason": "Brief justification"
    }
  ],
  "unmatchedFields": ["fieldId1"],
  "missingProfileKeys": ["key1"]
}`;
}

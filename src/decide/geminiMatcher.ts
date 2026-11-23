import { StandardProfileKeysSchema } from '../types/profile';

export interface FieldMetadata {
  id: string;
  name: string;
  label: string;
  type: string;
  placeholder?: string;
  options?: string[];
  hint?: string;
  isInsideIframe?: boolean;
  selector?: string;
}

export interface FieldMatchDecision {
  fieldId: string;
  profileKey: string | null;
  confidence: number; // 0.0 to 1.0
  explanation: string;
  isIframe?: boolean;
}

export interface MatchFieldsOptions {
  fields: FieldMetadata[];
  profileKeys: string[];
  apiKey: string;
  model?: string;
  fetchFn?: typeof fetch;
}

/**
 * Standard list of candidate profile keys for Indian government/academic forms.
 */
export const DEFAULT_PROFILE_KEYS: string[] = Object.keys(
  StandardProfileKeysSchema.shape
);

/**
 * Builds the strict Rule 1 prompt for Gemini.
 * CRITICAL ZERO-LEAKAGE PRIVACY INVARIANT:
 * NEVER include user profile values, document texts, or vault contents in this prompt.
 * Only field metadata (labels, names, hints, options) and candidate profile key names are sent.
 */
export function buildGeminiMatchingPrompt(
  fields: FieldMetadata[],
  profileKeys: string[]
): string {
  // Minimize field representation to save tokens and prevent any inadvertent data inclusion
  const sanitizedFields = fields.map((f) => ({
    id: f.id,
    name: f.name,
    label: f.label,
    type: f.type,
    placeholder: f.placeholder || undefined,
    options: f.options && f.options.length > 0 ? f.options.slice(0, 10) : undefined,
    hint: f.hint || undefined,
    isInsideIframe: f.isInsideIframe || undefined,
  }));

  return `You are FormPilot's AI Decision Engine for Indian web forms (scholarships, KYC, state recruitment, university portals).

TASK:
Match each web form field to the single most appropriate profile key name from the provided list of AVAILABLE_PROFILE_KEYS.

CRITICAL PRIVACY & SECURITY RULES:
1. You are only provided field names and candidate key names. Do NOT guess or hallucinate user values.
2. If a form field is a CAPTCHA, verification code, OTP, or submit/reset button, set profileKey to null and confidence to 0.0 with explanation "Preserved for user (Rule 2: CAPTCHA / OTP guard)".
3. If a form field cannot be answered by any of the available profile keys, set profileKey to null with confidence 0.0.
4. For banking / KYC fields inside iframes (e.g. IFSC code, Bank Account Number, Account Type, Beneficiary), match them accurately to ifsc, bankAccount, bankAccountType, fullName.
5. For academic/category fields (e.g. Caste/Social Category, College Name, Degree, Percentage/CGPA, Annual Family Income), match them to category, institution, course, marksPercent, annualIncome.

AVAILABLE_PROFILE_KEYS:
${JSON.stringify(profileKeys, null, 2)}

FORM_FIELDS_TO_MATCH:
${JSON.stringify(sanitizedFields, null, 2)}

OUTPUT FORMAT:
Respond with a strict JSON object containing a "matches" array:
{
  "matches": [
    {
      "fieldId": "exact_field_id_from_input",
      "profileKey": "matched_key_or_null",
      "confidence": 0.95,
      "explanation": "Concise justification for why this field maps to this key"
    }
  ]
}

Confidence scale:
- 0.90 to 1.00: Exact semantic match (e.g. "Full Legal Name" -> fullName, "IFSC Code" -> ifsc)
- 0.75 to 0.89: High confidence match (e.g. "Applicant's Name" -> fullName, "Father/Husband" -> fatherName)
- 0.50 to 0.74: Plausible match requiring verification
- 0.00: No match or CAPTCHA/OTP guard`;
}

/**
 * Matches form fields to profile keys using Google Gemini 2.5 Flash / Pro.
 * Strictly adheres to Rule 1: No profile values are sent across the wire.
 */
export async function matchFieldsWithGemini({
  fields,
  profileKeys,
  apiKey,
  model = 'gemini-2.5-flash',
  fetchFn = fetch,
}: MatchFieldsOptions): Promise<FieldMatchDecision[]> {
  if (!fields || fields.length === 0) {
    return [];
  }

  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('Gemini API key is required for LLM field matching.');
  }

  const validProfileKeys = profileKeys && profileKeys.length > 0 ? profileKeys : DEFAULT_PROFILE_KEYS;
  const prompt = buildGeminiMatchingPrompt(fields, validProfileKeys);

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  };

  const response = await fetchFn(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let parsedMessage = errorText;
    try {
      const errJson = JSON.parse(errorText);
      if (errJson.error?.message) {
        parsedMessage = errJson.error.message;
      }
    } catch {
      // Use raw text
    }

    if (response.status === 400 && parsedMessage.includes('API_KEY_INVALID')) {
      throw new Error('Invalid Google Gemini API key. Please verify in FormPilot Options.');
    }
    if (response.status === 429) {
      throw new Error('Gemini API rate limit exceeded. Please wait a moment or switch to local heuristics.');
    }

    throw new Error(`Gemini API error (${response.status}): ${parsedMessage}`);
  }

  const responseData = await response.json();
  const candidateText =
    responseData.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!candidateText) {
    throw new Error('Gemini returned an empty response.');
  }

  // Parse JSON response safely, handling potential code block fences
  let parsedJson: { matches?: Array<any> } = {};
  try {
    const cleanedText = candidateText.replace(/```json\s*|```\s*$/g, '').trim();
    parsedJson = JSON.parse(cleanedText);
  } catch (parseError) {
    throw new Error(`Failed to parse Gemini decision response as JSON: ${parseError}`);
  }

  const rawMatches = Array.isArray(parsedJson.matches) ? parsedJson.matches : [];
  const matchMap = new Map<string, { profileKey: string | null; confidence: number; explanation: string }>();

  for (const m of rawMatches) {
    if (m && typeof m.fieldId === 'string') {
      const pKey = typeof m.profileKey === 'string' && validProfileKeys.includes(m.profileKey)
        ? m.profileKey
        : null;
      const conf = typeof m.confidence === 'number' ? Math.min(1.0, Math.max(0.0, m.confidence)) : 0.0;
      const expl = typeof m.explanation === 'string' ? m.explanation : '';
      matchMap.set(m.fieldId, { profileKey: pKey, confidence: conf, explanation: expl });
    }
  }

  // Ensure every input field has a corresponding decision record
  return fields.map((f) => {
    const found = matchMap.get(f.id);
    if (found) {
      return {
        fieldId: f.id,
        profileKey: found.profileKey,
        confidence: found.confidence,
        explanation: found.explanation || `Mapped to ${found.profileKey || 'none'}`,
        isIframe: f.isInsideIframe,
      };
    }

    // Default if LLM omitted this field
    return {
      fieldId: f.id,
      profileKey: null,
      confidence: 0.0,
      explanation: 'No LLM mapping returned for this field.',
      isIframe: f.isInsideIframe,
    };
  });
}
